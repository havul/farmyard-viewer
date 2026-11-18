/** EDIT THIS FILE to change the project. Units: metres; Y is up. */
export const PROJECT = {
  title: 'Barn Construction · Interactive Build',
  subtitle: 'Interactive site & construction study',
  frameCount: 721,
  fps: 24, // 50 Barnscape frames + 671 barn frames = 721 global frames
  assets: {
    // Keep null to use the built-in demo. Replace with your actual files in public/models/.
    landscape: `${import.meta.env.BASE_URL}Barnscape_04.glb`, // persistent animated environment; file goes in public/
    scanPreview: null, // e.g. '/models/farm_scan_low.glb' (fast, low-detail)
    scanDetailed: null, // e.g. '/models/farm_scan_final.glb' (loads after preview)
    construction: `${import.meta.env.BASE_URL}models/barn_animation.glb`, // put your own GLB in public/models/
    environmentHDR: `${import.meta.env.BASE_URL}environments/meadow_2_4k.exr`, // change to '/environments/sunny_fields_1k.hdr' once downloaded
  },
  environment: {
    showBackground: true, // UI toggle hides sky image, but NEVER disables HDR illumination
    backgroundColor: '#cbdbe0', // plain colour when sky image is hidden
    intensity: 1.0,
    backgroundBlur: 0,
    rotationDegrees: 0,
  },
  roof: { objectName: 'BarnRoof', fadeStartFrame: 178, fadeEndFrame: 190 }, // matches Blender object name (and children)
  stageJumpSeconds: 1.05, // clicking a stage animates to its end this quickly
  showDemoSiteWithoutScan: false, // set true to show illustrative demo farmyard
  // All model roots can be repositioned without editing the GLB.
  placement: {
    landscape: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    scan: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    construction: { position: [19, -3.5, 10], rotation: [0, Math.PI, 0], scale: 1 },
  },
  camera: { position: [36, 26, 38], target: [0, 3, 0], minDistance: 5, maxDistance: 140 },
  constructionAnimation: {
    clipName: null, // null = ALL exported clips; set a name to play only one clip
    startFrame: 50,  // Barn begins after Remove Trailer; GLB original frame 0 maps here
    endFrame: 721,
    // All glTF clips are driven using the same absolute 24 fps Blender timeline.
  },
  landscapeAnimation: { clipName: null, startFrame: 0, endFrame: 50 },
  // Barnscape stays visible throughout and holds its frame-50 pose after that.
  // Each button smoothly plays from the current frame to this stage's end frame.
  // Overlapping source ranges are kept exactly as supplied.
  chapters: [
    { start: 0, end: 50, title: 'Remove Trailer', description: 'The existing trailer is removed before construction begins.' },
    { start: 50,   end: 71,  title: 'Concrete Pad', description: 'Concrete pad on site.' },
    { start: 71,  end: 93,  title: 'Concrete Walls', description: 'Concrete walls are installed.' },
    { start: 93,  end: 138,  title: 'Doors Installed', description: 'Door assemblies are installed.' },
    { start: 138,  end: 166, title: 'Roof Constructed', description: 'Roof construction takes shape.' },
    { start: 178, end: 205, title: 'Barn Decorated', description: 'Decorative finishing stage.' },
    { start: 206, end: 245, title: 'Frame Erected', description: 'Structural frame erection.' },
    { start: 255, end: 293, title: 'Rafters Screwed In', description: 'Rafters secured to the frame.' },
    { start: 308, end: 384, title: 'Insulation Installed', description: 'Insulation fitted.' },
    { start: 383, end: 431, title: 'Plasterboard Laid', description: 'Plasterboard installed.' },
    { start: 428, end: 483, title: 'Internal Doors Attached', description: 'Internal door installation.' },
    { start: 501, end: 619, title: 'Battens Sawn', description: 'Battens prepared and sawn.' },
    { start: 623, end: 721, title: 'Battens Insulated', description: 'Insulation installed to battens; completed sequence.' },
  ],
  // Normalized positions inside the loaded barn's bounds: [left-to-right, height, back-to-front].
  // Adjust these after viewing the model. Each point appears at its stage START frame.
  pointsOfInterest: [
    {id:'pad',title:'Concrete Pad',category:'Build stage 01',relativePosition:[.50,.08,.52],fromFrame:50,description:'The concrete pad forms the base for construction.'},
    {id:'walls',title:'Concrete Walls',category:'Build stage 02',relativePosition:[.84,.34,.48],fromFrame:71,description:'Perimeter concrete walls are installed.'},
    {id:'doors',title:'Doors Installed',category:'Build stage 03',relativePosition:[.51,.28,.89],fromFrame:93,description:'External door assemblies are installed.'},
    {id:'roof',title:'Roof Constructed',category:'Build stage 04',relativePosition:[.51,.94,.47],fromFrame:138,description:'The roof is constructed over the barn.'},
    {id:'decor',title:'Barn Decorated',category:'Build stage 05',relativePosition:[.18,.49,.54],fromFrame:178,description:'Decorative finishes are added.'},
    // Later work is grouped into the back-left of the building, as requested.
    {id:'frame',title:'Frame Erected',category:'Build stage 06',relativePosition:[.18,.44,.17],fromFrame:206,description:'Internal frame is erected.'},
    {id:'rafters',title:'Rafters Screwed In',category:'Build stage 07',relativePosition:[.31,.78,.19],fromFrame:255,description:'Rafters are secured.'},
    {id:'insulation',title:'Insulation Installed',category:'Build stage 08',relativePosition:[.15,.65,.26],fromFrame:308,description:'Insulation is installed in the framing.'},
    {id:'plaster',title:'Plasterboard Laid',category:'Build stage 09',relativePosition:[.32,.39,.31],fromFrame:383,description:'Plasterboard is fitted.'},
    {id:'internaldoor',title:'Internal Doors Attached',category:'Build stage 10',relativePosition:[.12,.25,.37],fromFrame:428,description:'Internal doors are attached.'},
    {id:'battens',title:'Battens Sawn',category:'Build stage 11',relativePosition:[.31,.56,.12],fromFrame:501,description:'Battens are measured and sawn.'},
    {id:'batteninsulation',title:'Battens Insulated',category:'Build stage 12',relativePosition:[.12,.80,.12],fromFrame:623,description:'Battens are insulated.'},
  ],
};
