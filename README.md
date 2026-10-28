# Vaatwasser VR

Schone nieuwe versie van de Quest/WebXR-vaatwassertaak.

## Protocol
1. Start VR.
2. Houd de rechter controller tegen de rechterschouder en druk op de trigger.
3. Breng de hand naar een comfortabele startpositie en druk opnieuw.
4. Raak het bord aan en druk trigger om het te pakken.
5. Breng het bord naar de plank en druk trigger om het los te laten.

## Visuele manipulatie
Alleen de verticale bewegingsuitslag van de virtuele hand/arm wordt aangepast:

- 0-20 s: 1.00
- 20-40 s: 0.95
- 40-60 s: 0.90
- 60-80 s: 0.85
- 80-100 s: 0.80
- 100-120 s: 0.75

De virtuele arm begint bij het tijdens de kalibratie opgeslagen schouderpunt.
De plankhoogte wordt ingesteld op 5 cm onder het schouderpunt.

## Nieuwe ontwikkelversie v11

Open [dev/v11.html](dev/v11.html) voor de 3D-keuken, keuze van experimenteerarm, bilaterale kalibratie en steeds hetzelfde voorste bord. De bestaande startpagina en v10 blijven beschikbaar. Zie [protocol, meetgedrag en validatie](dev/v11-README.md). De versie is in Chromium met gesimuleerde tracking getest; controle op de Quest zelf is nog nodig.
