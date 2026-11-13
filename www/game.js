import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const ui = {
  viewport: $('viewport'), loading: $('loadingScreen'), menu: $('menuScreen'), pause: $('pauseScreen'),
  gameover: $('gameoverScreen'), error: $('errorScreen'), errorMessage: $('errorMessage'),
  hudTop: $('hudTop'), raceHud: $('raceHud'), controls: $('controls'), speed: $('speedValue'),
  speedBar: $('speedBar'), distance: $('distanceValue'), score: $('scoreValue'), menuBest: $('menuBest'),
  finalScore: $('finalScore'), finalDistance: $('finalDistance'), newRecord: $('newRecord'), toast: $('toast')
};

const DIFFICULTIES = {
  rookie: { maxSpeed: 155, spawnEvery: 1.75, label: 'ROOKIE' },
  pro: { maxSpeed: 205, spawnEvery: 1.32, label: 'PRO' },
  elite: { maxSpeed: 250, spawnEvery: 1.02, label: 'ELITE' }
};
const ROAD_WIDTH = 11;
const LANES = [-3.25, 0, 3.25];
const ROAD_LENGTH = 220;
const bestKey = 'mr-rony-racing-best-v1';

let scene, camera, renderer, bike, bikeBody, headlight, bikeWheelMeshes = [];
let state = 'loading';
let difficulty = 'pro';
let speed = 0;
let distance = 0;
let score = 0;
let laneX = 0;
let targetX = 0;
let steerInput = 0;
let throttle = false;
let braking = false;
let spawnClock = 0;
let scenery = [];
let traffic = [];
let crashClock = 0;
let crashRotation = 0;
let lastFrame = 0;
let menuClock = 0;
let audio = null;
let soundEnabled = true;
let roadFlash = 0;

function showError(error) {
  console.error(error);
  ui.loading.classList.add('hidden');
  ui.error.classList.remove('hidden');
  ui.error.setAttribute('aria-hidden', 'false');
  ui.errorMessage.textContent = error?.message || 'This browser could not start the 3D game. Try a browser with WebGL enabled.';
}

function mat(color, roughness = 0.68, metalness = 0.12, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function box(parent, w, h, d, material, x = 0, y = 0, z = 0, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, r1, r2, length, material, x, y, z, rx = 0, ry = 0, rz = 0, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, length, segments), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeBike() {
  bike = new THREE.Group();
  bike.position.set(0, 0, 0.1);
  bikeBody = new THREE.Group();
  bike.add(bikeBody);
  const rubber = mat(0x11151a, 0.84, 0.06);
  const tireSide = mat(0x262d35, 0.56, 0.24);
  const steel = mat(0x929da8, 0.34, 0.78);
  const darkMetal = mat(0x242c36, 0.4, 0.68);
  const red = mat(0xf22635, 0.34, 0.4, { emissive: 0x42060b });
  const redHi = mat(0xff3946, 0.3, 0.38, { emissive: 0x33050a });
  const black = mat(0x10141b, 0.5, 0.27);
  const carbon = mat(0x1c232b, 0.55, 0.42);
  const wheelZ = [-0.98, 1.02];
  for (const z of wheelZ) {
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.51, z);
    wheel.rotation.z = Math.PI / 2;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.14, 12, 28), rubber);
    tire.castShadow = true;
    wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 8, 24), steel);
    rim.position.x = 0.015;
    wheel.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.32, 12), tireSide);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.58, 0.025), steel);
      spoke.rotation.x = i * Math.PI / 4;
      wheel.add(spoke);
    }
    bikeBody.add(wheel);
    bikeWheelMeshes.push(wheel);
  }
  // Twin swing arms, fork legs, frame and engine block.
  for (const x of [-0.17, 0.17]) {
    cylinder(bikeBody, 0.055, 0.06, 1.12, darkMetal, x, 0.66, 0.24, Math.PI / 2);
    cylinder(bikeBody, 0.048, 0.06, 0.94, steel, x, 0.83, -0.69, -0.18);
  }
  box(bikeBody, 0.48, 0.5, 0.52, darkMetal, 0, 0.77, 0.12);
  box(bikeBody, 0.34, 0.12, 0.37, steel, 0, 0.8, 0.12);
  // Sculpted lower fairing and fuel tank.
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), red);
  belly.scale.set(0.62, 0.53, 1.12); belly.position.set(0, 0.9, -0.28); belly.castShadow = true; bikeBody.add(belly);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 12), redHi);
  tank.scale.set(0.7, 0.54, 0.85); tank.position.set(0, 1.23, 0.12); tank.castShadow = true; bikeBody.add(tank);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.82, 5), red);
  tail.rotation.x = -Math.PI / 2; tail.scale.set(0.78, 1, 0.52); tail.position.set(0, 1.12, 0.88); bikeBody.add(tail);
  box(bikeBody, 0.42, 0.13, 0.58, black, 0, 1.31, 0.57);
  // Tail lamp, exhausts and winglets.
  box(bikeBody, 0.26, 0.075, 0.045, mat(0xff2538, .28, .25, { emissive: 0xff0c22, emissiveIntensity: 1.6 }), 0, 1.21, 1.24);
  for (const x of [-0.25, 0.25]) {
    cylinder(bikeBody, 0.08, 0.055, 0.9, steel, x * 1.45, 0.67, 0.5, 0, 0, Math.PI / 2);
    const wing = box(bikeBody, 0.62, 0.055, 0.32, red, x * 2.1, 0.97, -0.39);
    wing.rotation.y = x < 0 ? -0.1 : 0.1;
  }
  // Front cowl, windscreen, lamp and handle bars.
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), red);
  cowl.scale.set(0.83, 0.9, 0.75); cowl.position.set(0, 1.22, -0.76); cowl.castShadow = true; bikeBody.add(cowl);
  const screen = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mat(0x193d4b, 0.18, .34, { transparent: true, opacity: .8 }));
  screen.scale.set(.8, .76, .55); screen.position.set(0, 1.48, -.77); bikeBody.add(screen);
  headlight = new THREE.Mesh(new THREE.BoxGeometry(.25, .12, .045), mat(0x9bf4ff, .18, .18, { emissive: 0x57dfff, emissiveIntensity: 2.2 }));
  headlight.position.set(0, 1.2, -1.075); bikeBody.add(headlight);
  cylinder(bikeBody, .04, .04, .92, black, 0, 1.22, -.72, 0, 0, Math.PI / 2);
  for (const x of [-.43, .43]) cylinder(bikeBody, .035, .035, .23, rubber, x, 1.22, -.72, 0, 0, Math.PI / 2);
  // Rider silhouette: racing suit, arms, gloves and helmet.
  const suit = mat(0x171f2a, .52, .18);
  const rider = new THREE.Group();
  rider.position.set(0, 0, 0.03);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .56, 4, 8), suit);
  torso.rotation.x = -0.42; torso.position.set(0, 1.62, .05); rider.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.29, 14, 12), mat(0xf3f5f7, .25, .26));
  helmet.scale.set(1, 1.12, 1); helmet.position.set(0, 2.02, -.38); rider.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 8), mat(0x142834, .12, .56, { emissive: 0x071a27 }));
  visor.scale.set(1, .7, .5); visor.position.set(0, 2.04, -.58); rider.add(visor);
  for (const sign of [-1, 1]) {
    const arm = cylinder(rider, .105, .075, .68, suit, sign * .27, 1.6, -.35, -1.05, 0, sign * .25);
    arm.rotation.z = sign * .19;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(.105, 8, 8), black); glove.position.set(sign * .48, 1.28, -.67); rider.add(glove);
    const leg = cylinder(rider, .12, .095, .7, suit, sign * .2, 1.16, .33, .35, 0, sign * .13);
    leg.rotation.z = sign * .1;
  }
  bikeBody.add(rider);
  const lamp = new THREE.SpotLight(0x9ceeff, 9, 47, Math.PI / 8, .5, 1.5);
  lamp.position.set(0, 1.22, -1.05); lamp.target.position.set(0, .2, -12); bike.add(lamp, lamp.target);
  scene.add(bike);
}

function makeCar(color = 0x265475) {
  const group = new THREE.Group();
  const paint = mat(color, .32, .55, { emissive: color, emissiveIntensity: .05 });
  const glass = mat(0x13232e, .16, .3, { metalness: .2 });
  const tire = mat(0x0c1015, .9, 0);
  box(group, 1.7, .56, 3.1, paint, 0, .77, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.36, .58, 1.55), glass);
  cabin.position.set(0, 1.28, -.04); cabin.castShadow = true; group.add(cabin);
  box(group, 1.58, .14, .34, paint, 0, 1.03, -.81);
  box(group, 1.58, .14, .34, paint, 0, 1.03, .79);
  const lampMaterial = mat(0xff2438, .24, .1, { emissive: 0xff1020, emissiveIntensity: 1.6 });
  const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(.25, .12, .04), lampMaterial);
  for (const x of [-.55, .55]) { const l = tailLamp.clone(); l.position.set(x, .93, 1.57); group.add(l); }
  for (const x of [-.82, .82]) for (const z of [-.98, .98]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .2, 12), tire);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .39, z); wheel.castShadow = true; group.add(wheel);
  }
  group.userData.width = 1.6;
  return group;
}

function makeObstacle() {
  const group = new THREE.Group();
  const orange = mat(0xff6b24, .48, .12);
  const reflector = mat(0xe5f6ff, .3, .18, { emissive: 0x345268, emissiveIntensity: .28 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(.88, .16, .82), mat(0x232931, .76, .12));
  base.position.y = .08; base.castShadow = true; group.add(base);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(.06, .38, 1.05, 9), orange);
  cone.position.y = .66; cone.castShadow = true; group.add(cone);
  for (const [radius, y] of [[.25, .48], [.34, .25]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius, .055, 6, 12), reflector);
    band.rotation.x = Math.PI / 2; band.position.y = y; group.add(band);
  }
  group.userData.obstacle = true;
  return group;
}

function makeTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .24, 2, 6), mat(0x493d36)); trunk.position.y = 1; trunk.castShadow = true; tree.add(trunk);
  const foliage = mat(0x142d2a, .94, 0, { emissive: 0x061210 });
  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.15 - i * .2, 1.7, 7), foliage);
    crown.position.y = 2.1 + i * .78; crown.castShadow = true; tree.add(crown);
  }
  return tree;
}

function makeLamp() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 7, 7), mat(0x263444, .55, .56)); pole.position.y = 3.5; pole.castShadow = true; group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 1.4), mat(0x344555, .5, .6)); arm.position.set(0, 6.7, -.54); group.add(arm);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x7bdfff });
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(.42, .12, .48), glowMat); bulb.position.set(0, 6.62, -1.13); group.add(bulb);
  return group;
}

function addScenery() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, ROAD_LENGTH), mat(0x182323, 1, 0));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.08, -ROAD_LENGTH / 2 + 10); ground.receiveShadow = true; scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH), mat(0x282e38, .94, .08));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -ROAD_LENGTH / 2 + 10); road.receiveShadow = true; scene.add(road);
  const shoulderMat = mat(0x67727c, .82, .12);
  for (const x of [-ROAD_WIDTH / 2 - .2, ROAD_WIDTH / 2 + .2]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(.45, .12, ROAD_LENGTH), shoulderMat);
    shoulder.position.set(x, .015, -ROAD_LENGTH / 2 + 10); shoulder.receiveShadow = true; scene.add(shoulder);
  }
  const stripeMat = mat(0xd4dde0, .65, .06, { emissive: 0x26333a, emissiveIntensity: .15 });
  for (const x of [-ROAD_WIDTH / 6, ROAD_WIDTH / 6]) {
    for (let z = 10; z > -ROAD_LENGTH; z -= 10) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(.12, .026, 4.6), stripeMat);
      dash.position.set(x, .035, z); dash.receiveShadow = true; scene.add(dash); scenery.push({ object: dash, kind: 'dash', reset: ROAD_LENGTH });
    }
  }
  const railMat = mat(0x56616d, .52, .62);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.12, .32, ROAD_LENGTH), railMat);
    rail.position.set(side * (ROAD_WIDTH / 2 + 1.1), .55, -ROAD_LENGTH / 2 + 10); rail.castShadow = true; scene.add(rail);
    for (let z = 8; z > -ROAD_LENGTH; z -= 12) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.16, .82, .16), railMat);
      post.position.set(side * (ROAD_WIDTH / 2 + 1.1), .35, z); scene.add(post); scenery.push({ object: post, kind: 'post', reset: ROAD_LENGTH });
    }
  }
  const treeCount = 36;
  for (let i = 0; i < treeCount; i++) {
    const z = 8 - i * 6;
    for (const side of [-1, 1]) {
      const tree = makeTree(); tree.position.set(side * (9 + Math.random() * 5), 0, z - Math.random() * 4); tree.scale.setScalar(.8 + Math.random() * .45); scene.add(tree);
      scenery.push({ object: tree, kind: 'tree', reset: ROAD_LENGTH });
    }
  }
  for (let i = 0; i < 13; i++) {
    const lamp = makeLamp(); const side = i % 2 ? 1 : -1;
    lamp.position.set(side * (ROAD_WIDTH / 2 + 2.5), 0, 2 - i * 17); scene.add(lamp); scenery.push({ object: lamp, kind: 'lamp', reset: ROAD_LENGTH });
  }
  // Distant dark ridge gives the horizon depth without image assets.
  const ridgeMat = mat(0x18202b, 1, 0);
  for (let i = 0; i < 14; i++) {
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(13 + Math.random() * 8, 18 + Math.random() * 14, 5), ridgeMat);
    ridge.position.set((i - 7) * 19, 7, -125 - Math.random() * 30); ridge.scale.x = 1.7; scene.add(ridge);
  }
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111a27);
  scene.fog = new THREE.FogExp2(0x111a27, .0088);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 360);
  camera.position.set(0, 4.3, 9.3);
  camera.lookAt(0, .9, -12);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  ui.viewport.replaceChildren(renderer.domElement);
  const hemi = new THREE.HemisphereLight(0x9bbdd4, 0x1a201d, 2.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6bd, 2.8); sun.position.set(-7, 14, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -15; sun.shadow.camera.right = 15; sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -9; scene.add(sun);
  const rim = new THREE.PointLight(0x238fff, 25, 25, 2); rim.position.set(5, 3, 2); scene.add(rim);
  addScenery();
  makeBike();
  window.addEventListener('resize', onResize, { passive: true });
}

function onResize() {
  if (!renderer || !camera) return;
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  camera.aspect = w / h;
  camera.fov = w < h ? 67 : 59;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w < h ? 1.45 : 1.7));
  renderer.setSize(w, h);
}

function getBest() {
  try { return Number(localStorage.getItem(bestKey) || 0); } catch { return 0; }
}
function setBest(value) {
  try { localStorage.setItem(bestKey, String(value)); } catch { /* storage can be disabled */ }
}
function formatScore(value) { return Math.max(0, Math.floor(value)).toString().padStart(6, '0'); }
function refreshBest() { ui.menuBest.textContent = formatScore(getBest()); }

function configureScreen(next) {
  state = next;
  const active = next === 'playing';
  ui.hudTop.classList.toggle('active', active || next === 'paused');
  ui.raceHud.classList.toggle('active', active || next === 'paused');
  ui.controls.classList.toggle('active', active);
  ui.menu.classList.toggle('hidden', next !== 'menu');
  ui.pause.classList.toggle('hidden', next !== 'paused');
  ui.gameover.classList.toggle('hidden', next !== 'gameover');
  ui.error.classList.toggle('hidden', next !== 'error');
  for (const [element, visible] of [[ui.menu, next === 'menu'], [ui.pause, next === 'paused'], [ui.gameover, next === 'gameover'], [ui.error, next === 'error']]) {
    element.setAttribute('aria-hidden', String(!visible));
  }
  if (next === 'menu') refreshBest();
}

function spawnTraffic() {
  const makeRoadObstacle = Math.random() < (difficulty === 'elite' ? .27 : difficulty === 'rookie' ? .12 : .2);
  const car = makeRoadObstacle ? makeObstacle() : makeCar([0xd52e40, 0x1f70a6, 0xd0d4db, 0xc98323][Math.floor(Math.random() * 4)]);
  const lane = Math.floor(Math.random() * LANES.length);
  car.position.set(LANES[lane], 0, -112 - Math.random() * 12);
  const relative = difficulty === 'elite' ? .82 : difficulty === 'rookie' ? 1.08 : .94;
  car.userData.speedFactor = relative + Math.random() * .14;
  car.userData.passed = false;
  scene.add(car);
  traffic.push(car);
}

function clearTraffic() {
  for (const car of traffic) { scene.remove(car); disposeObject(car); }
  traffic = [];
}

function disposeObject(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

function resetRun() {
  clearTraffic();
  speed = 18;
  distance = 0;
  score = 0;
  laneX = 0;
  targetX = 0;
  steerInput = 0;
  throttle = false;
  braking = false;
  spawnClock = 0;
  crashClock = 0;
  crashRotation = 0;
  bike.position.set(0, 0, .1);
  bikeBody.rotation.set(0, 0, 0);
  bikeBody.position.set(0, 0, 0);
  camera.position.set(0, 4.3, 9.3);
  camera.lookAt(0, .9, -12);
  ui.speed.textContent = '018';
  ui.speedBar.style.width = '9%';
  ui.distance.textContent = '0.0';
  ui.score.textContent = formatScore(0);
}

function startGame() {
  resetRun();
  configureScreen('playing');
  playTone(440, .09, 'triangle', .035);
  setTimeout(() => { if (state === 'playing') showToast(DIFFICULTIES[difficulty].label); }, 240);
}

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('show');
  void ui.toast.offsetWidth;
  ui.toast.classList.add('show');
}

function pauseGame() {
  if (state !== 'playing') return;
  configureScreen('paused');
  clearInputs();
}
function resumeGame() {
  if (state !== 'paused') return;
  configureScreen('playing');
  lastFrame = performance.now();
}
function goToMenu() {
  clearInputs(); clearTraffic(); resetRun(); configureScreen('menu');
}

function crash() {
  if (state !== 'playing') return;
  configureScreen('crashing');
  ui.hudTop.classList.add('active'); ui.raceHud.classList.add('active');
  clearInputs();
  crashClock = 0;
  crashRotation = (Math.random() < .5 ? -1 : 1) * 1.18;
  playCrashSound();
  if (navigator.vibrate) navigator.vibrate([70, 35, 120]);
}

function finishCrash() {
  const finalScore = Math.floor(score);
  const isRecord = finalScore > getBest();
  if (isRecord) setBest(finalScore);
  ui.finalScore.textContent = formatScore(finalScore);
  ui.finalDistance.textContent = distance.toFixed(1);
  ui.newRecord.classList.toggle('hidden', !isRecord);
  configureScreen('gameover');
}

function clearInputs() {
  steerInput = 0; throttle = false; braking = false;
  document.querySelectorAll('.control-button.pressed').forEach(button => button.classList.remove('pressed'));
}

function createAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const master = ctx.createGain(); master.gain.value = soundEnabled ? .52 : 0; master.connect(ctx.destination);
  const engineGain = ctx.createGain(); engineGain.gain.value = .0001; engineGain.connect(master);
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.connect(engineGain);
  const engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 48; engineOsc.connect(filter); engineOsc.start();
  audio = { ctx, master, engineGain, engineOsc, filter, musicTimer: 0, note: 0 };
  startMusic();
}
function startMusic() {
  if (!audio || audio.musicTimer) return;
  const notes = [110, 146.83, 164.81, 220, 164.81, 146.83, 123.47, 164.81];
  audio.musicTimer = window.setInterval(() => {
    if (!audio || !soundEnabled || audio.ctx.state !== 'running') return;
    const ctx = audio.ctx;
    const freq = notes[audio.note++ % notes.length];
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.07, ctx.currentTime + .04);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .34);
    osc.connect(gain); gain.connect(audio.master); osc.start(); osc.stop(ctx.currentTime + .36);
  }, 390);
}
function playTone(freq, duration = .12, type = 'sine', gainValue = .09) {
  if (!audio || !soundEnabled || audio.ctx.state !== 'running') return;
  const osc = audio.ctx.createOscillator(); const gain = audio.ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, audio.ctx.currentTime);
  gain.gain.setValueAtTime(gainValue, audio.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.ctx.currentTime + duration);
  osc.connect(gain); gain.connect(audio.master); osc.start(); osc.stop(audio.ctx.currentTime + duration);
}
function playCrashSound() {
  if (!audio || !soundEnabled || audio.ctx.state !== 'running') return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(190, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + .7);
  gain.gain.setValueAtTime(.28, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .72);
  osc.connect(gain); gain.connect(audio.master); osc.start(); osc.stop(ctx.currentTime + .75);
}
function syncAudio() {
  if (!audio) return;
  const moving = state === 'playing' || state === 'crashing';
  const level = moving ? .014 + (speed / DIFFICULTIES[difficulty].maxSpeed) * .085 : .0001;
  audio.engineGain.gain.setTargetAtTime(level, audio.ctx.currentTime, .12);
  audio.engineOsc.frequency.setTargetAtTime(38 + speed * .7, audio.ctx.currentTime, .12);
  audio.filter.frequency.setTargetAtTime(210 + speed * 4, audio.ctx.currentTime, .15);
}

function bindControls() {
  const bindHold = (element, setter, pressedClass = true) => {
    const down = (event) => { event.preventDefault(); setter(true); if (pressedClass) element.classList.add('pressed'); if (element.setPointerCapture && event.pointerId !== undefined) element.setPointerCapture(event.pointerId); if (audio?.ctx.state === 'suspended') audio.ctx.resume(); };
    const up = (event) => { if (event) event.preventDefault(); setter(false); if (pressedClass) element.classList.remove('pressed'); };
    element.addEventListener('pointerdown', down);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(name, up);
    element.addEventListener('contextmenu', event => event.preventDefault());
  };
  bindHold($('leftButton'), value => { steerInput = value ? -1 : (steerInput === -1 ? 0 : steerInput); });
  bindHold($('rightButton'), value => { steerInput = value ? 1 : (steerInput === 1 ? 0 : steerInput); });
  bindHold($('accelerateButton'), value => { throttle = value; });
  bindHold($('brakeButton'), value => { braking = value; });

  $('playButton').addEventListener('click', () => { if (!audio) createAudio(); audio?.ctx.resume(); startGame(); });
  $('againButton').addEventListener('click', () => { audio?.ctx.resume(); startGame(); });
  $('resumeButton').addEventListener('click', resumeGame);
  $('pauseButton').addEventListener('click', pauseGame);
  $('quitButton').addEventListener('click', goToMenu);
  $('garageButton').addEventListener('click', goToMenu);
  $('errorRetry').addEventListener('click', () => location.reload());
  $('soundButton').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('soundButton').textContent = soundEnabled ? '♪' : '×';
    $('soundButton').setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
    if (!audio && soundEnabled) createAudio();
    if (audio) {
      audio.master.gain.setTargetAtTime(soundEnabled ? .52 : 0, audio.ctx.currentTime, .04);
      if (soundEnabled) audio.ctx.resume();
      else audio.ctx.suspend();
    }
  });
  document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    difficulty = button.dataset.difficulty;
    document.querySelectorAll('[data-difficulty]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    playTone(320, .07, 'triangle', .025);
  }));
  document.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
    if ((event.key === 'Escape' || event.key.toLowerCase() === 'p') && state === 'playing') pauseGame();
    else if ((event.key === 'Escape' || event.key.toLowerCase() === 'p') && state === 'paused') resumeGame();
    if (state !== 'playing') return;
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') steerInput = -1;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') steerInput = 1;
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w' || event.key === ' ') throttle = true;
    if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') braking = true;
  });
  document.addEventListener('keyup', event => {
    if (['ArrowLeft', 'a', 'A'].includes(event.key) && steerInput === -1) steerInput = 0;
    if (['ArrowRight', 'd', 'D'].includes(event.key) && steerInput === 1) steerInput = 0;
    if (['ArrowUp', ' ', 'w', 'W'].includes(event.key)) throttle = false;
    if (['ArrowDown', 's', 'S'].includes(event.key)) braking = false;
  });
  window.addEventListener('blur', clearInputs);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });
}

function updateGame(dt) {
  if (state === 'playing') {
    const maxSpeed = DIFFICULTIES[difficulty].maxSpeed;
    const targetSpeed = throttle ? maxSpeed : Math.max(55, speed - 8);
    speed += (targetSpeed - speed) * Math.min(1, dt * (throttle ? 1.08 : .34));
    if (braking) speed = Math.max(0, speed - 128 * dt);
    if (!throttle && !braking && speed < 55) speed = Math.min(55, speed + 8 * dt);
    const travel = speed * dt * .075;
    distance += travel / 270;
    score += travel * (speed / 55) * (difficulty === 'elite' ? 1.4 : difficulty === 'rookie' ? .8 : 1);
    targetX = THREE.MathUtils.clamp(targetX + steerInput * dt * 5.7, -3.45, 3.45);
    laneX += (targetX - laneX) * Math.min(1, dt * 6.6);
    bike.position.x = laneX;
    bikeBody.rotation.z = THREE.MathUtils.lerp(bikeBody.rotation.z, -steerInput * .32 - (targetX - laneX) * .035, Math.min(1, dt * 7));
    bikeWheelMeshes.forEach(wheel => { wheel.rotation.x += travel * 1.7; });
    roadFlash = Math.max(0, roadFlash - dt * 1.4);
    moveWorld(travel);
    spawnClock += dt;
    const config = DIFFICULTIES[difficulty];
    if (spawnClock >= config.spawnEvery) { spawnClock = 0; spawnTraffic(); }
    updateTraffic(dt, travel);
    ui.speed.textContent = String(Math.round(speed)).padStart(3, '0');
    ui.speedBar.style.width = `${Math.min(100, speed / config.maxSpeed * 100)}%`;
    ui.distance.textContent = distance.toFixed(1);
    ui.score.textContent = formatScore(score);
  } else if (state === 'crashing') {
    crashClock += dt;
    const progress = Math.min(1, crashClock / 1.12);
    bikeBody.rotation.z = crashRotation * Math.sin(progress * Math.PI / 2);
    bikeBody.rotation.x = .24 * Math.sin(progress * Math.PI);
    bikeBody.position.y = -.22 * Math.sin(progress * Math.PI / 2);
    bike.position.x += crashRotation * dt * .28;
    camera.position.x += (bike.position.x * .18 - camera.position.x) * Math.min(1, dt * 4);
    speed = Math.max(0, speed - 140 * dt);
    ui.speed.textContent = String(Math.round(speed)).padStart(3, '0');
    if (crashClock > 1.2) finishCrash();
  } else if (state === 'menu') {
    menuClock += dt;
    bike.position.x = Math.sin(menuClock * .35) * .35;
    bikeBody.rotation.z = Math.sin(menuClock * .5) * .025;
    const menuTravel = Math.max(0, dt * 4.2);
    moveWorld(menuTravel);
  }
  if (state === 'paused') { syncAudio(); return; }
  syncAudio();
}

function moveWorld(travel) {
  for (const item of scenery) {
    item.object.position.z += travel;
    if (item.object.position.z > 14) item.object.position.z -= item.reset;
  }
}

function updateTraffic(dt, travel) {
  const playerZ = bike.position.z;
  for (let i = traffic.length - 1; i >= 0; i--) {
    const car = traffic[i];
    car.position.z += travel * (1 - car.userData.speedFactor);
    // Traffic heads in the same direction. Its relative speed is small, so use player travel
    // to bring it into view while retaining a visible oncoming/lane-pass feel.
    car.position.z += travel * .62;
    if (car.position.z > 5.5) {
      if (!car.userData.passed) { car.userData.passed = true; score += car.userData.obstacle ? 80 : 175; }
      scene.remove(car); disposeObject(car); traffic.splice(i, 1); continue;
    }
    const dz = Math.abs(car.position.z - playerZ);
    const dx = Math.abs(car.position.x - bike.position.x);
    if (dz < (car.userData.obstacle ? 1.3 : 1.9) && dx < (car.userData.obstacle ? .82 : 1.28) && state === 'playing') { crash(); return; }
  }
}

function updateCamera(dt, time) {
  const shake = state === 'crashing' ? (1 - Math.min(1, crashClock / 1.1)) * .18 : 0;
  const desiredX = bike.position.x * .34 + Math.sin(time * 46) * shake;
  const desiredY = 4.22 + Math.sin(time * 8) * .025 + (state === 'crashing' ? -.25 * Math.min(1, crashClock) : 0);
  const desiredZ = 9.3;
  camera.position.x += (desiredX - camera.position.x) * Math.min(1, dt * 3.8);
  camera.position.y += (desiredY - camera.position.y) * Math.min(1, dt * 3.8);
  camera.position.z += (desiredZ - camera.position.z) * Math.min(1, dt * 3.8);
  camera.lookAt(bike.position.x * .24, .88, -12);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!renderer || !scene) return;
  const dt = Math.min(.05, Math.max(0, (now - (lastFrame || now)) / 1000));
  lastFrame = now;
  updateGame(dt);
  updateCamera(dt, now / 1000);
  renderer.render(scene, camera);
}

async function boot() {
  bindControls();
  refreshBest();
  try {
    init3D();
    configureScreen('menu');
    ui.loading.classList.add('hidden');
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  } catch (error) {
    configureScreen('error');
    showError(error);
  }
}

boot();
