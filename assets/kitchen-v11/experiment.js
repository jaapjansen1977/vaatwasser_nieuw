/* global AFRAME, THREE */
'use strict';
(() => {
  const CFG = Object.freeze({duration:120, stillSeconds:5, stillRadius:.055,
    pickupRadius:.19, respawnMs:450, shelfOffset:-.05, frontDistance:.60});
  const gainAt = seconds => Math.max(.75, 1 - .05 * Math.floor(Math.max(0, seconds) / 20));
  // Two-bone IK: keep both lengths fixed and report unreachable targets separately.
  function solveArm(shoulder, target, upper, lower, bend) {
    const delta = target.clone().sub(shoulder), distance = delta.length();
    const axis = distance > 1e-6 ? delta.multiplyScalar(1 / distance) : new THREE.Vector3(0,-1,0);
    const reach = Math.max(Math.abs(upper-lower)+.0001, Math.min(upper+lower-.0001, distance));
    const a = (upper*upper-lower*lower+reach*reach)/(2*reach);
    const perp = bend.clone().addScaledVector(axis,-bend.dot(axis));
    if (perp.lengthSq()<1e-6) perp.set(1,0,0).addScaledVector(axis,-axis.x);
    if (perp.lengthSq()<1e-6) perp.set(0,0,1).addScaledVector(axis,-axis.z);
    perp.normalize();
    return {elbow:shoulder.clone().addScaledVector(axis,a).addScaledVector(perp,Math.sqrt(Math.max(0,upper*upper-a*a))),
      wrist:shoulder.clone().addScaledVector(axis,reach), unreachable:distance > upper+lower+.025};
  }
  class Experiment {
    constructor(scene) {
      this.scene=scene; this.phase='LOADING'; this.ready=false; this.active=false;
      this.hand='right'; this.rows=[]; this.calibration=null; this.carrying=false;
      this.placed=0; this.plateNumber=1; this.waitUntil=0; this.lastLog=0;
      this.connected={left:false,right:false}; this.grips={left:false,right:false};
      this.visual=new THREE.Vector3(); this.currentShoulder=new THREE.Vector3();
      this.ui=Object.fromEntries(['status','error','enter','reset','save','hand','summary','hud'].map(id=>[id,document.getElementById(id)]));
      this.controllers={left:document.getElementById('left'),right:document.getElementById('right')};
      this.kitchen=document.getElementById('kitchen');
      this.ui.hand.addEventListener('change',()=>{if(!this.active)this.hand=this.ui.hand.value;});
      this.ui.enter.addEventListener('click',()=>scene.enterVR().catch(e=>this.fail('VR starten lukt niet: '+e.message)));
      this.ui.reset.addEventListener('click',()=>this.reset());
      this.ui.save.addEventListener('click',()=>this.saveCSV());
      Object.entries(this.controllers).forEach(([side,el])=>{
        el.addEventListener('controllerconnected',()=>{this.connected[side]=true;el.object3D.visible=false;});
        el.addEventListener('controllerdisconnected',()=>{this.connected[side]=false;});
        el.addEventListener('model-loaded',()=>{el.object3D.visible=false;});
        el.addEventListener('triggerdown',()=>this.trigger(side));
        el.addEventListener('gripdown',()=>{this.grips[side]=true;});
        el.addEventListener('gripup',()=>{this.grips[side]=false;this.gripStart=null;});
        for(const button of ['abuttondown','bbuttondown','xbuttondown','ybuttondown'])el.addEventListener(button,()=>{
          if(['FINISHED','ABORTED'].includes(this.phase))scene.exitVR();
        });
      });
      scene.addEventListener('enter-vr',()=>{
        if(!scene.renderer.xr.isPresenting)return;
        this.active=true; document.body.classList.add('in-vr');this.ui.hand.disabled=true;
        if(this.phase==='READY')this.phase='WAIT_HANG';
        this.updatePrompt();
        const session=scene.renderer.xr.getSession();
        session.addEventListener('visibilitychange',()=>{
          if(session.visibilityState!=='visible'&&this.phase==='RUNNING')this.finish('ABORTED','VR onderbroken');
        });
      });
      scene.addEventListener('exit-vr',()=>{
        if(this.phase==='RUNNING')this.finish('ABORTED','VR verlaten');
        this.active=false;document.body.classList.remove('in-vr');
        if(!['FINISHED','ABORTED'].includes(this.phase)&&this.ready)this.reset();
        this.ui.reset.disabled=!this.ready;
      });
      this.kitchen.addEventListener('model-loaded',()=>this.loadModel());
      this.kitchen.addEventListener('model-error',()=>this.fail('De 3D-keuken kon niet laden. Herlaad de pagina.'));
      // Handles cached assets loaded before this script ran.
      if(this.kitchen.getObject3D('mesh'))this.loadModel();
    }
    fail(text){this.ui.error.textContent=text;this.message(text);}
    message(text){if(this.lastMessage===text)return;this.lastMessage=text;this.ui.status.textContent=text;this.ui.hud.setAttribute('value',text);}
    loadModel(){
      if(this.ready)return;
      this.model=this.kitchen.getObject3D('mesh');
      this.shelf=this.model.getObjectByName('Shelf_adjustable');
      this.front=this.model.getObjectByName('Plate_01');
      if(!this.shelf||!this.front)return this.fail('Keukenbestand mist de plank of het voorste bord.');
      this.frontHome=this.front.position.clone();this.frontRotation=this.front.quaternion.clone();
      // Reserve plates are scenery only. They never receive a grab handler.
      this.reserve=[];for(let i=2;i<=6;i++){const p=this.model.getObjectByName('Plate_0'+i);if(p)this.reserve.push(p);}
      this.carried=new THREE.Mesh(this.front.geometry,this.front.material);this.carried.name='CarriedPlate';this.carried.visible=false;this.scene.object3D.add(this.carried);
      this.placedGroup=new THREE.Group();this.placedGroup.name='PlacedPlates';this.shelf.add(this.placedGroup);
      this.makeArm();this.ready=true;this.phase='READY';this.ui.enter.disabled=false;this.ui.reset.disabled=false;
      this.message('Kies links of rechts en start VR.');
    }
    makeArm(){
      this.arm=new THREE.Group();this.arm.visible=false;this.scene.object3D.add(this.arm);
      const skin=new THREE.MeshStandardMaterial({color:0xb77d58,roughness:.8});
      const sleeve=new THREE.MeshStandardMaterial({color:0x526e81,roughness:.95});
      const sphere=new THREE.SphereGeometry(1,12,8), cylinder=new THREE.CylinderGeometry(1,1,1,10);
      const mesh=(geo,mat)=>{const m=new THREE.Mesh(geo,mat);this.arm.add(m);return m;};
      this.upper=mesh(cylinder,sleeve);this.lower=mesh(cylinder,skin);
      this.shoulderMesh=mesh(sphere,sleeve);this.shoulderMesh.scale.set(.075,.075,.075);
      this.elbow=mesh(sphere,skin);this.elbow.scale.set(.044,.044,.044);
      this.handGroup=new THREE.Group();this.arm.add(this.handGroup);
      const palm=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),skin);palm.scale.set(.039,.025,.066);palm.position.z=-.035;this.handGroup.add(palm);
      for(let i=0;i<4;i++){
        const finger=new THREE.Mesh(new THREE.CapsuleGeometry(.009,.045,2,6),skin);finger.rotation.x=Math.PI/2;
        finger.position.set((i-1.5)*.018,-.005,-.103+(i===0||i===3?.008:0));this.handGroup.add(finger);
      }
      const thumb=new THREE.Mesh(new THREE.CapsuleGeometry(.012,.035,2,6),skin);thumb.name='Thumb';thumb.rotation.x=.8;this.handGroup.add(thumb);this.thumb=thumb;
    }
    readPoses(){
      const session=this.scene.renderer?.xr.getSession();
      if(!session)return null;
      const sources=Array.from(session.inputSources);
      const frame=this.scene.frame, reference=this.scene.renderer.xr.getReferenceSpace();
      const head=new THREE.Vector3();this.scene.camera.getWorldPosition(head);
      const headQ=new THREE.Quaternion();this.scene.camera.getWorldQuaternion(headQ);
      const result={head,headQ};
      for(const side of ['left','right']){
        const source=sources.find(s=>s.handedness===side&&s.gripSpace);
        if(!source||!this.connected[side])continue;
        if(frame&&reference&&!frame.getPose(source.gripSpace,reference))continue;
        const el=this.controllers[side];result[side]={p:el.object3D.getWorldPosition(new THREE.Vector3()),q:el.object3D.getWorldQuaternion(new THREE.Quaternion())};
      }
      return result;
    }
    reset(){
      if(this.phase==='RUNNING')return;
      this.phase='READY';this.rows=[];this.calibration=null;this.carrying=false;this.placed=0;this.plateNumber=1;this.startHand=null;this.startTime=null;this.lastSample=null;this.trackingLostAt=null;
      this.sampleStart=null;this.samples=[];this.hanging=null;this.waitUntil=0;this.gripStart=null;
      this.front.position.copy(this.frontHome);this.front.quaternion.copy(this.frontRotation);this.front.visible=true;
      this.reserve.forEach(p=>p.visible=true);this.carried.visible=false;this.arm.visible=false;
      while(this.placedGroup.children.length)this.placedGroup.remove(this.placedGroup.children[0]);
      this.ui.hand.disabled=false;this.ui.save.disabled=true;this.ui.summary.textContent='';this.ui.error.textContent='';
      if(this.active){this.ui.hand.disabled=true;this.phase='WAIT_HANG';}
      this.updatePrompt();
    }
    updatePrompt(){
      const selected=this.hand==='left'?'linker':'rechter';
      const messages={READY:'Kies links of rechts en start VR.',WAIT_HANG:'Laat beide armen ontspannen langs het lijf hangen. Druk op de trigger om 5 seconden te meten.',HANG:'Houd beide armen stil langs het lijf.',SHOULDERS:'Leg beide controllers tegen de schouders. Druk op een trigger om vast te leggen.',WAIT_START:'Breng de '+selected+'hand naar een comfortabele startpositie. Druk op de trigger om te starten.',RUNNING:this.carrying?'Leg het bord op de voorkant van de plank en druk op de trigger.':'Pak het voorste bord met de '+selected+'hand en druk op de trigger.'};
      if(messages[this.phase])this.message(messages[this.phase]);
    }
    trigger(side){
      if(!this.active||!this.ready)return;
      const poses=this.readPoses();const now=performance.now();
      if(['FINISHED','ABORTED'].includes(this.phase)){this.scene.exitVR();return;}
      if(['WAIT_HANG','SHOULDERS'].includes(this.phase)&&(!poses?.left||!poses?.right))return this.message('Beide controllers moeten zichtbaar zijn voor de kalibratie.');
      if(this.phase==='WAIT_HANG'){
        this.phase='HANG';this.samples=[];this.sampleStart=null;this.updatePrompt();return;
      }
      if(this.phase==='SHOULDERS')return this.calibrate(poses);
      if(side!==this.hand)return;
      if(!poses?.[side])return;
      if(this.phase==='WAIT_START'){
        this.startHand=poses[side].p.clone();this.startTime=now;this.lastLog=now;this.phase='RUNNING';this.ui.reset.disabled=true;
        this.log('start',poses,1,now);this.updatePrompt();return;
      }
      if(this.phase!=='RUNNING')return;
      if(now-this.startTime>=CFG.duration*1000){this.finish('FINISHED','Tijd verstreken');return;}
      const gain=gainAt((now-this.startTime)/1000);this.visual.copy(poses[side].p);this.visual.y=this.startHand.y+gain*(this.visual.y-this.startHand.y);
      if(!this.carrying){
        if(now<this.waitUntil)return;
        const target=this.front.getWorldPosition(new THREE.Vector3());
        if(this.visual.distanceTo(target)>CFG.pickupRadius)return this.message('Breng de virtuele hand bij het voorste bord en druk opnieuw.');
        this.carrying=true;this.front.visible=false;this.carried.visible=true;
        // Keep the plate's grasp offset, transformed with the controller's orientation.
        this.grabOffset=target.sub(this.visual).applyQuaternion(poses[side].q.clone().invert());
        const worldQ=this.front.getWorldQuaternion(new THREE.Quaternion());
        this.grabRotation=poses[side].q.clone().invert().multiply(worldQ);
        this.moveCarried(poses[side]);this.log('pickup',poses,gain,now);this.updatePrompt();
      }else{
        this.moveCarried(poses[side]);
        const local=this.shelf.worldToLocal(this.carried.getWorldPosition(new THREE.Vector3()));
        // Shelf front is local z=-.72; target only its near section, never the wall.
        if(Math.abs(local.x)>.56||local.z<-1.04||local.z>-.68||local.y<0||local.y>.32)
          return this.message('Breng het bord boven de voorrand van de plank en druk opnieuw.');
        const p=new THREE.Mesh(this.front.geometry,this.front.material);p.name='PlacedPlate_'+(this.placed+1);
        // Five short stacks at the front, with geometry centred on the actual shelf surface.
        p.position.set(((this.placed%5)-2)*.225,.028+Math.floor(this.placed/5)*.013,-.88);
        // Exported glTF plate geometry is already horizontal in its local XZ plane.
        p.quaternion.identity();this.placedGroup.add(p);
        this.placed++;this.log('place',poses,gain,now);this.plateNumber++;this.carrying=false;this.carried.visible=false;
        this.waitUntil=now+CFG.respawnMs;this.message('Bord geplaatst. Het voorste bord verschijnt opnieuw.');
      }
    }
    calibrate(poses){
      if(!this.hanging)return;
      const calibration={};
      for(const side of ['left','right']){
        const p=poses[side].p,offset=p.clone().sub(poses.head);
        const length=p.clone().sub(poses.head).sub(this.hanging[side]).length();
        if(length<.35||length>.95||offset.y> .04||offset.y<-.50||Math.abs(offset.x)>.65)
          return this.message('Kalibratie niet gelukt. Houd beide controllers tegen de schouders en druk opnieuw.');
        calibration[side]={offset,length,upper:length*.48,lower:length*.52};
      }
      if(poses.left.p.distanceTo(poses.right.p)<.18)return this.message('Houd één controller tegen elke schouder.');
      this.calibration=calibration;
      // The body frame retains its calibrated heading; looking sideways does not rotate the torso.
      const forward=new THREE.Vector3(0,0,-1).applyQuaternion(poses.headQ);forward.y=0;
      if(forward.length()<.2)return this.message('Kijk recht vooruit en kalibreer de schouders opnieuw.');
      forward.normalize();this.heading=Math.atan2(-forward.x,-forward.z);
      this.kitchen.object3D.position.set(poses.head.x,0,poses.head.z);
      this.kitchen.object3D.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),this.heading);
      // GLB's nearest plate starts at z=-.75. Translate the scene toward the participant.
      this.kitchen.object3D.position.addScaledVector(forward,CFG.frontDistance-.75);
      const shoulder=poses[this.hand].p;
      this.shelf.position.y=shoulder.y+CFG.shelfOffset-.0275;
      this.scene.object3D.updateMatrixWorld(true);
      this.phase='WAIT_START';this.log('calibration',poses,1,performance.now());this.updatePrompt();
    }
    sampleHanging(poses,now){
      if(!poses?.left||!poses?.right){this.samples=[];this.sampleStart=null;this.message('Beide controllers in beeld houden. De 5 seconden beginnen opnieuw.');return;}
      const sample={left:poses.left.p.clone().sub(poses.head),right:poses.right.p.clone().sub(poses.head)};
      if(sample.left.y>-.35||sample.right.y>-.35){this.samples=[];this.sampleStart=null;this.message('Laat beide armen ontspannen omlaag hangen.');return;}
      if(!this.sampleStart){this.sampleStart=now;this.sampleAnchor=sample;this.samples=[];}
      if(['left','right'].some(side=>sample[side].distanceTo(this.sampleAnchor[side])>CFG.stillRadius)){
        this.sampleStart=now;this.sampleAnchor=sample;this.samples=[];
      }
      // Time-throttled samples avoid allocating a vector pair for every refresh in storage.
      if(!this.lastSample||now-this.lastSample>=50){this.samples.push(sample);this.lastSample=now;}
      const elapsed=(now-this.sampleStart)/1000;
      this.message('Armen stil langs het lijf: nog '+Math.max(0,Math.ceil(CFG.stillSeconds-elapsed))+' seconden.');
      if(elapsed>=CFG.stillSeconds&&this.samples.length>=40){
        this.hanging={};for(const side of ['left','right']){
          const mean=new THREE.Vector3();this.samples.forEach(s=>mean.add(s[side]));this.hanging[side]=mean.divideScalar(this.samples.length);
        }
        this.phase='SHOULDERS';this.updatePrompt();
      }
    }
    moveCarried(pose){this.carried.position.copy(this.grabOffset).applyQuaternion(pose.q).add(this.visual);this.carried.quaternion.copy(pose.q).multiply(this.grabRotation);}
    drawArm(poses){
      const c=this.calibration[this.hand];this.currentShoulder.copy(poses.head).add(c.offset);
      const right=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),this.heading);
      const forward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),this.heading);
      const bend=right.multiplyScalar(this.hand==='right'?.7:-.7).addScaledVector(forward,-.65).add(new THREE.Vector3(0,-.6,0));
      const solved=solveArm(this.currentShoulder,this.visual,c.upper,c.lower,bend);
      const segment=(mesh,a,b,r)=>{mesh.position.copy(a).add(b).multiplyScalar(.5);const dir=b.clone().sub(a);mesh.scale.set(r,dir.length(),r);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());};
      segment(this.upper,this.currentShoulder,solved.elbow,.047);segment(this.lower,solved.elbow,solved.wrist,.034);
      this.shoulderMesh.position.copy(this.currentShoulder);this.elbow.position.copy(solved.elbow);
      // Hand always represents the manipulated position. Never show a second, real hand.
      this.handGroup.position.copy(this.visual);this.handGroup.quaternion.copy(poses[this.hand].q);
      this.thumb.position.set(this.hand==='right'?-.042:.042,-.003,-.04);
      this.arm.visible=true;this.armUnreachable=solved.unreachable;
      // At unreachable targets, hide the sleeve/forearm rather than stretching anatomy or changing the experimental hand target.
      this.upper.visible=this.lower.visible=this.elbow.visible=!solved.unreachable;
    }
    tick(now){
      if(!this.ready||!this.active)return;
      const poses=this.readPoses();
      if(this.phase==='HANG'){this.sampleHanging(poses,now);return;}
      if(this.phase==='RUNNING'&&now-this.startTime>=CFG.duration*1000){this.finish('FINISHED','Tijd verstreken');return;}
      if(!poses?.[this.hand]){
        this.arm.visible=false;this.carried.visible=false;
        if(this.phase==='RUNNING'){
          if(this.trackingLostAt==null)this.trackingLostAt=now;
          if(now-this.trackingLostAt>500)this.finish('ABORTED','Controllertracking onderbroken');
        }
        return;
      }
      this.trackingLostAt=null;
      if(this.grips[this.hand]){
        if(this.gripStart==null)this.gripStart=now;
        if(now-this.gripStart>=2000){if(this.phase==='RUNNING')this.finish('ABORTED','Afgebroken met gripknop');else this.scene.exitVR();return;}
      }else this.gripStart=null;
      if(!this.calibration)return;
      this.visual.copy(poses[this.hand].p);let gain=1;
      if(this.phase==='RUNNING'){
        gain=gainAt((now-this.startTime)/1000);this.visual.y=this.startHand.y+gain*(this.visual.y-this.startHand.y);
        if(this.carrying){this.carried.visible=true;this.moveCarried(poses[this.hand]);}
        else if(!this.front.visible&&now>=this.waitUntil){this.front.position.copy(this.frontHome);this.front.quaternion.copy(this.frontRotation);this.front.visible=true;this.updatePrompt();}
      }
      if(['FINISHED','ABORTED'].includes(this.phase)){this.arm.visible=false;return;}
      this.drawArm(poses);
      if(this.phase==='RUNNING'&&now-this.lastLog>=50){this.log('frame',poses,gain,now);this.lastLog=now;}
    }
    log(event,poses,gain,now){
      const p=poses?.[this.hand]?.p,q=poses?.[this.hand]?.q;
      const shoulder=this.calibration&&poses?.head?poses.head.clone().add(this.calibration[this.hand].offset):null;
      this.rows.push({event,time:this.startTime==null?0:Math.max(0,(now-this.startTime)/1000),hand:this.hand,gain,plate_number:this.plateNumber,placed_count:this.placed,
        controller_x:p?.x??'',controller_y:p?.y??'',controller_z:p?.z??'',controller_qx:q?.x??'',controller_qy:q?.y??'',controller_qz:q?.z??'',controller_qw:q?.w??'',
        visual_y:this.startHand&&p?this.startHand.y+gain*(p.y-this.startHand.y):'',head_x:poses?.head.x??'',head_y:poses?.head.y??'',head_z:poses?.head.z??'',
        shoulder_x:shoulder?.x??'',shoulder_y:shoulder?.y??'',shoulder_z:shoulder?.z??'',carrying:this.carrying,arm_unreachable:!!this.armUnreachable,
        left_arm_length:this.calibration?.left.length??'',right_arm_length:this.calibration?.right.length??'',placement_y_basis:'visual_y',version:'v11'});
    }
    finish(phase,reason){
      if(this.phase!=='RUNNING')return;
      const now=performance.now(),poses=this.readPoses();this.log(phase==='FINISHED'?'finish':'abort',poses,gainAt((now-this.startTime)/1000),now);
      this.phase=phase;this.arm.visible=false;this.carried.visible=false;this.ui.save.disabled=false;this.ui.reset.disabled=false;
      this.ui.summary.textContent=(phase==='FINISHED'?'Meting voltooid.':'Meting afgebroken: '+reason+'.')+'\nBorden geplaatst: '+this.placed;
      this.message((phase==='FINISHED'?'Klaar.':'Meting afgebroken.')+' Druk op een trigger om VR te verlaten. Download daarna de CSV.');
      this.saveCSV();
    }
    csv(){if(!this.rows.length)return '';const fields=Object.keys(this.rows[0]);return fields.join(',')+'\n'+this.rows.map(r=>fields.map(f=>String(r[f]??'')).join(',')).join('\n');}
    saveCSV(){
      const csv=this.csv();if(!csv)return;
      try{localStorage.setItem('vaatwasser_last_csv',csv);localStorage.setItem('vaatwasser_last_saved_at',new Date().toISOString());}catch(e){this.ui.error.textContent='Lokale reservekopie niet beschikbaar; download de CSV.';}
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='vaatwasser_v11_'+this.hand+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }
  }
  AFRAME.registerComponent('hud-overlay',{
    schema:{type:'number',default:10000},
    init(){
      const apply=()=>this.el.object3D.traverse(o=>{
        o.renderOrder=this.data;
        if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material])){m.depthTest=false;m.depthWrite=false;}}
      });
      this.el.addEventListener('object3dset',apply);this.el.addEventListener('textfontset',apply);apply();
    }
  });
  AFRAME.registerComponent('kitchen-runtime',{init(){this.experiment=new Experiment(this.el);window.kitchenExperiment=this.experiment;},tick(){this.experiment?.tick(performance.now());}});
  window.KitchenMath={gainAt,solveArm,CFG};
})();
