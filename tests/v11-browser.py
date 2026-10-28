"""Browser integration test with simulated tracked poses, not a headset test.
Run a local server on port 8000, then python3 tests/v11-browser.py.
AFRAME_BUNDLE optionally serves an already verified A-Frame 1.7.1 bundle.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    bundle=os.environ.get('AFRAME_BUNDLE')
    if bundle:
        page.route('https://cdn.jsdelivr.net/npm/aframe@1.7.1/dist/aframe-master.min.js',lambda route:route.fulfill(path=str(Path(bundle).resolve()),content_type='text/javascript'))
    page.goto('http://127.0.0.1:8000/dev/v11.html',wait_until='networkidle')
    page.wait_for_function('window.kitchenExperiment?.ready',timeout=30000)
    result=page.evaluate('''() => {
      const app=window.kitchenExperiment, {gainAt,solveArm}=KitchenMath;
      const checks=[]; const ok=(condition,name)=>{if(!condition)throw Error(name);checks.push(name);};
      const near=(a,b)=>Math.abs(a-b)<1e-5;
      const V=(x,y,z)=>new THREE.Vector3(x,y,z);
      const Q=()=>new THREE.Quaternion();
      ok(app.ui.hud.components.text.currentFont && app.ui.hud.components.text.material.depthTest===false,'local HUD font loaded and visible through scene geometry');
      let clock=1000;
      const originalNow=performance.now.bind(performance);
      Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
      const poses={head:V(0,1.65,0),headQ:Q(),left:{p:V(-.2,.8,0),q:Q()},right:{p:V(.2,.8,0),q:Q()}};
      app.readPoses=()=>poses;
      try {
        ok(near(gainAt(0),1)&&near(gainAt(19.99),1)&&near(gainAt(20),.95)&&near(gainAt(100),.75)&&near(gainAt(120),.75),'gain schedule boundaries');
        const shoulder=V(.2,1.4,0), arm=solveArm(shoulder,V(.25,1.05,-.2),.29,.31,V(.7,-.6,.65));
        ok(near(arm.elbow.distanceTo(shoulder),.29)&&near(arm.elbow.distanceTo(arm.wrist),.31),'IK keeps upper and lower arm lengths');
        ok(solveArm(shoulder,V(3,3,3),.29,.31,V(1,-1,0)).unreachable,'IK detects out-of-reach targets');
        for(const side of ['right','left']) {
          app.active=false;app.reset();app.hand=side;app.active=true;app.phase='WAIT_HANG';
          poses.head.set(0,1.65,0);poses.left.p.set(-.2,.8,0);poses.right.p.set(.2,.8,0);
          clock+=1000;app.trigger(side);
          // An unstable sample must restart the five-second measurement.
          app.tick(clock);clock+=1000;poses.left.p.x-=.10;app.tick(clock);
          ok(app.phase==='HANG',side+': unstable calibration does not complete');
          poses.left.p.x=-.2;clock+=100;app.tick(clock);
          for(let i=0;i<103;i++){clock+=50;app.tick(clock);}
          ok(app.phase==='SHOULDERS',side+': five second bilateral arm sampling completes');
          poses.left.p.set(-.2,1.4,0);poses.right.p.set(.2,1.4,0);app.trigger(side);
          ok(app.phase==='WAIT_START',side+': shoulder calibration accepted');
          ok(near(app.calibration.left.length,.6)&&near(app.calibration.right.length,.6),side+': measured bilateral reach');
          ok(near(app.shelf.position.y+.0275,1.35),side+': shelf top five cm below shoulder');
          poses[side].p.set(side==='left'?-.2:.2,1.0,-.25);app.trigger(side);
          ok(app.phase==='RUNNING',side+': selected arm starts trial');
          const startTime=clock;
          const front=app.front.getWorldPosition(V(0,0,0));
          const setVisual=target=>{const gain=gainAt((clock-app.startTime)/1000);poses[side].p.copy(target);poses[side].p.y=app.startHand.y+(target.y-app.startHand.y)/gain;};
          for(let n=0;n<7;n++) {
            clock=startTime+n*3500;setVisual(front);app.tick(clock);
            const other=side==='left'?'right':'left';app.trigger(other);
            ok(!app.carrying,side+': nonselected trigger ignored '+n);
            app.trigger(side);ok(app.carrying&&!app.front.visible,side+': front plate picked '+n);
            const below=app.shelf.localToWorld(V(0,-.12,-.85));setVisual(below);app.tick(clock);app.trigger(side);
            ok(app.carrying,side+': below-shelf placement rejected '+n);
            const destination=app.shelf.localToWorld(V(0,.15,-.85));setVisual(destination);app.tick(clock);app.trigger(side);
            ok(!app.carrying&&app.placed===n+1,side+': plate placed at front of shelf '+n);
            clock+=200;app.tick(clock);ok(!app.front.visible,side+': respawn delay '+n);
            clock+=300;app.tick(clock);ok(app.front.visible&&app.front.getWorldPosition(V(0,0,0)).distanceTo(front)<1e-6,side+': identical front position restored '+n);
          }
          clock=startTime+40000;poses[side].p.copy(poses.head).add(app.calibration[side].offset).add(V(0,-.3,-.1));app.tick(clock);
          const before=app.currentShoulder.clone();poses.head.add(V(.1,0,-.12));poses[side].p.add(V(.1,0,-.12));app.tick(clock);
          ok(app.currentShoulder.clone().sub(before).distanceTo(V(.1,0,-.12))<1e-6,side+': shoulder follows headset translation');
          ok(!/gain|real|werkelijk|hoogte|dY/i.test(app.ui.hud.getAttribute('value')),side+': no measurement diagnostics in VR HUD');
          ok(app.rows.some(r=>r.event==='frame'&&r.gain<1&&r.controller_y!==r.visual_y),side+': raw and manipulated heights logged separately');
          clock=startTime+120001;app.tick(clock);
          ok(app.phase==='FINISHED'&&app.placed===7,side+': 120-second trial finishes');
          ok(localStorage.getItem('vaatwasser_last_csv').includes('controller_y'),side+': CSV backup retained');
          const bounds=new THREE.Box3().setFromObject(app.placedGroup.children[0]);
          ok(bounds.max.y-bounds.min.y<.04,side+': placed plate lies flat');
          ok(app.placedGroup.children.length===7,side+': placed plates visible on shelf');
          app.scene.emit('exit-vr');ok(app.phase==='FINISHED',side+': exiting preserves results');
        }
        app.active=false;app.reset();app.hand='right';app.active=true;app.phase='RUNNING';app.startTime=clock;app.startHand=poses.right.p.clone();
        const saved=poses.right;delete poses.right;app.tick(clock);clock+=600;app.tick(clock);
        ok(app.phase==='ABORTED','tracking loss aborts and preserves data');poses.right=saved;
        app.active=false;app.reset();ok(app.startTime===null&&app.placed===0&&app.front.visible,'reset clears previous trial state');
        return {count:checks.length,checks};
      } finally {Object.defineProperty(performance,'now',{configurable:true,value:originalNow});app.active=false;}
    }''')
    assert not errors,errors
    print('PASS:',result['count'],'browser assertions; no page errors')
    for check in result['checks']:
        print('  ',check)
    browser.close()
