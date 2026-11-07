/** EDIT THIS FILE to change the project. Units: metres; Y is up. */
export const PROJECT = {
  title: 'Barn Construction · Interactive Build',
  subtitle: 'Interactive site & construction study',
  frameCount: 671,
  fps: 24, // Blender timeline FPS; frame 671 is about 27.96 seconds
  assets: {
    // Keep null to use the built-in demo. Replace with your actual files in public/models/.
    scanPreview: null, // e.g. '/models/farm_scan_low.glb' (fast, low-detail)
    scanDetailed: null, // e.g. '/models/farm_scan_final.glb' (loads after preview)
    construction: 'https://your-blob-url.vercel-storage.com/barn_animation.glb',
    environmentHDR: `${import.meta.env.BASE_URL}environments/meadow_2_4k.exr`,
  },
  environment: {
    showBackground: true, // UI toggle hides sky image, but NEVER disables HDR illumination
    backgroundColor: '#cbdbe0', // plain colour when sky image is hidden
    intensity: 1.0,
    backgroundBlur: 0,
    rotationDegrees: 0,
  },
  roof: { objectName: 'BarnRoof', fadeStartFrame: 128, fadeEndFrame: 140 }, // matches Blender object name (and children)
  stageJumpSeconds: 1.05, // clicking a stage animates to its end this quickly
  showDemoSiteWithoutScan: false, // set true to show illustrative demo farmyard
  // All model roots can be repositioned without editing the GLB.
  placement: {
    scan: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    construction: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  },
  camera: { position: [36, 26, 38], target: [0, 3, 0], minDistance: 5, maxDistance: 140 },
  constructionAnimation: {
    clipName: null, // null = ALL exported clips; set a name to play only one clip
    startFrame: 0,   // authored build begins here
    endFrame: 671,
    // All glTF clips are driven using the same absolute 24 fps Blender timeline.
  },
  // Each button smoothly plays from the current frame to this stage's end frame.
  // Overlapping source ranges are kept exactly as supplied.
  chapters: [
    { start: 0,   end: 21,  title: 'Concrete Pad', description: 'Concrete pad on site.' },
    { start: 21,  end: 43,  title: 'Concrete Walls', description: 'Concrete walls are installed.' },
    { start: 43,  end: 88,  title: 'Doors Installed', description: 'Door assemblies are installed.' },
    { start: 88,  end: 116, title: 'Roof Constructed', description: 'Roof construction takes shape.' },
    { start: 128, end: 155, title: 'Barn Decorated', description: 'Decorative finishing stage.' },
    { start: 156, end: 195, title: 'Frame Erected', description: 'Structural frame erection.' },
    { start: 205, end: 243, title: 'Rafters Screwed In', description: 'Rafters secured to the frame.' },
    { start: 258, end: 334, title: 'Insulation Installed', description: 'Insulation fitted.' },
    { start: 333, end: 381, title: 'Plasterboard Laid', description: 'Plasterboard installed.' },
    { start: 378, end: 433, title: 'Internal Doors Attached', description: 'Internal door installation.' },
    { start: 451, end: 569, title: 'Battens Sawn', description: 'Battens prepared and sawn.' },
    { start: 573, end: 671, title: 'Battens Insulated', description: 'Insulation installed to battens; completed sequence.' },
  ],
  // Normalized positions inside the loaded barn's bounds: [left-to-right, height, back-to-front].
  // Adjust these after viewing the model. Each point appears at its stage START frame.
  pointsOfInterest: [
    {id:'pad',title:'Concrete Pad',category:'Build stage 01',relativePosition:[.50,.08,.52],fromFrame:0,description:'The concrete pad forms the base for construction.'},
    {id:'walls',title:'Concrete Walls',category:'Build stage 02',relativePosition:[.84,.34,.48],fromFrame:21,description:'Perimeter concrete walls are installed.'},
    {id:'doors',title:'Doors Installed',category:'Build stage 03',relativePosition:[.51,.28,.89],fromFrame:43,description:'External door assemblies are installed.'},
    {id:'roof',title:'Roof Constructed',category:'Build stage 04',relativePosition:[.51,.94,.47],fromFrame:88,description:'The roof is constructed over the barn.'},
    {id:'decor',title:'Barn Decorated',category:'Build stage 05',relativePosition:[.18,.49,.54],fromFrame:128,description:'Decorative finishes are added.'},
    // Later work is grouped into the back-left of the building, as requested.
    {id:'frame',title:'Frame Erected',category:'Build stage 06',relativePosition:[.18,.44,.17],fromFrame:156,description:'Internal frame is erected.'},
    {id:'rafters',title:'Rafters Screwed In',category:'Build stage 07',relativePosition:[.31,.78,.19],fromFrame:205,description:'Rafters are secured.'},
    {id:'insulation',title:'Insulation Installed',category:'Build stage 08',relativePosition:[.15,.65,.26],fromFrame:258,description:'Insulation is installed in the framing.'},
    {id:'plaster',title:'Plasterboard Laid',category:'Build stage 09',relativePosition:[.32,.39,.31],fromFrame:333,description:'Plasterboard is fitted.'},
    {id:'internaldoor',title:'Internal Doors Attached',category:'Build stage 10',relativePosition:[.12,.25,.37],fromFrame:378,description:'Internal doors are attached.'},
    {id:'battens',title:'Battens Sawn',category:'Build stage 11',relativePosition:[.31,.56,.12],fromFrame:451,description:'Battens are measured and sawn.'},
    {id:'batteninsulation',title:'Battens Insulated',category:'Build stage 12',relativePosition:[.12,.80,.12],fromFrame:573,description:'Battens are insulated.'},
  ],
};
