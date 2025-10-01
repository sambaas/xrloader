// References
// https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_paint.html
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/webxr/ARButton.js
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/webxr/VRButton.js

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TubePainter } from "three/examples/jsm/misc/TubePainter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
// Note: Cannot directly use the ARButton as it calls immersive-ar with dom and "local" reference space
// import { ARButton } from "three/examples/jsm/webxr/ARButton";

let camera, scene, renderer;
let controller1, controller2;
let currentSession;
const cursor = new THREE.Vector3();

// Model management variables
let loadedModel = null;
let placedModel = null;
let modelPlacementIndicator = null;
let raycaster = new THREE.Raycaster();
let inputSources = [];

let controls;

init();
animate();

function init() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();
  // Note: We need background to be transparent
  // for passthrough to work!

  // scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    50
  );
  camera.position.set(0, 1.6, 3);

  controls = new OrbitControls(camera, container);
  controls.target.set(0, 1.6, 0);
  controls.update();

  const floorGometry = new THREE.PlaneGeometry(100, 100);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.0
  });
  const floor = new THREE.Mesh(floorGometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  /*const grid = new THREE.GridHelper(10, 20, 0x111111, 0x111111);
  grid.material.depthTest = false; // avoid z-fighting
  scene.add(grid);*/

  scene.add(new THREE.HemisphereLight(0x888877, 0x777788));

  const light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(0, 4, 0);
  scene.add(light);

  // Load the closet.obj model
  const objLoader = new OBJLoader();
  objLoader.load('./closet.obj', function(object) {
    // Scale and position the loaded model
    object.scale.setScalar(0.5); // Adjust scale as needed
    object.position.set(0, 0, -2); // Place in front of viewer initially
    
    // Make sure the model has proper materials
    object.traverse(function(child) {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown color
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    loadedModel = object;
    scene.add(object);
    console.log('Closet model loaded successfully');
  }, undefined, function(error) {
    console.error('Error loading closet model:', error);
  });

  // Create placement indicator (a simple ring)
  const indicatorGeometry = new THREE.RingGeometry(0.3, 0.35, 16);
  const indicatorMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00, 
    transparent: true, 
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  modelPlacementIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
  modelPlacementIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
  modelPlacementIndicator.visible = false;
  scene.add(modelPlacementIndicator);

  //

  const painter1 = new TubePainter();
  scene.add(painter1.mesh);

  const painter2 = new TubePainter();
  scene.add(painter2.mesh);

  //
  // Note: Need alpha enabled for passthrough
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  //

  // document.body.appendChild(ARButton.createButton(renderer));

  // controllers

  function onSelectStart() {
    this.userData.isSelecting = true;
    
    // Left controller (controller1) - model placement
    if (this === controller1 && loadedModel) {
      handleModelPlacement();
    }
  }

  function onSelectEnd() {
    this.userData.isSelecting = false;
  }

  function onSqueezeStart() {
    this.userData.isSqueezing = true;
    this.userData.positionAtSqueezeStart = this.position.y;
    this.userData.scaleAtSqueezeStart = this.scale.x;
  }

  function onSqueezeEnd() {
    this.userData.isSqueezing = false;
  }

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  controller1.addEventListener("squeezestart", onSqueezeStart);
  controller1.addEventListener("squeezeend", onSqueezeEnd);
  controller1.userData.painter = painter1;
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener("selectstart", onSelectStart);
  controller2.addEventListener("selectend", onSelectEnd);
  controller2.addEventListener("squeezestart", onSqueezeStart);
  controller2.addEventListener("squeezeend", onSqueezeEnd);
  controller2.userData.painter = painter2;
  scene.add(controller2);

  //

  const geometry = new THREE.CylinderGeometry(0.01, 0.02, 0.08, 5);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);

  const pivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01, 3));
  pivot.name = "pivot";
  pivot.position.z = -0.05;
  mesh.add(pivot);

  controller1.add(mesh.clone());
  controller2.add(mesh.clone());

  //

  window.addEventListener("resize", onWindowResize);

  // Note: Click HTMl button to start session
  let arButton = document.querySelector("button");
  arButton.onclick = startAR;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleModelPlacement() {
  if (!loadedModel) return;
  
  // Get controller1 position and direction
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller1.matrixWorld);
  
  raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  // Check intersection with floor
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  for (let i = 0; i < intersects.length; i++) {
    const intersection = intersects[i];
    
    // Check if we hit the floor (assuming floor is at y = 0)
    if (intersection.point.y <= 0.1) {
      // Place the model at the intersection point
      if (placedModel) {
        scene.remove(placedModel);
      }
      
      // Clone the loaded model for placement
      placedModel = loadedModel.clone();
      placedModel.position.copy(intersection.point);
      placedModel.position.y = 0; // Ensure it's on the floor
      scene.add(placedModel);
      
      console.log('Model placed at:', intersection.point);
      break;
    }
  }
}

function updatePlacementIndicator() {
  if (!loadedModel || !controller1) return;
  
  // Get controller1 position and direction
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller1.matrixWorld);
  
  raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  // Check intersection with floor
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  let foundFloorHit = false;
  for (let i = 0; i < intersects.length; i++) {
    const intersection = intersects[i];
    
    // Check if we hit the floor
    if (intersection.point.y <= 0.1) {
      modelPlacementIndicator.position.copy(intersection.point);
      modelPlacementIndicator.position.y = 0.01; // Slightly above floor
      modelPlacementIndicator.visible = true;
      foundFloorHit = true;
      break;
    }
  }
  
  if (!foundFloorHit) {
    modelPlacementIndicator.visible = false;
  }
}

function handleModelRotation() {
  if (!placedModel || !currentSession) return;
  
  // Find the left controller input source (usually index 0)
  for (let i = 0; i < inputSources.length; i++) {
    const inputSource = inputSources[i];
    if (inputSource.gamepad && inputSource.handedness === 'left') {
      const gamepad = inputSource.gamepad;
      
      // Thumbstick is typically axes 2 and 3 (x and y)
      if (gamepad.axes.length >= 4) {
        const thumbstickX = gamepad.axes[2];
        const thumbstickY = gamepad.axes[3];
        
        // Use thumbstick X for rotation around Y-axis
        if (Math.abs(thumbstickX) > 0.1) { // Dead zone
          const rotationSpeed = 0.05;
          placedModel.rotation.y += thumbstickX * rotationSpeed;
        }
      }
      break;
    }
  }
}

function handleController(controller) {
  const userData = controller.userData;
  const painter = userData.painter;

  const pivot = controller.getObjectByName("pivot");

  // Only handle painting for controller2 (right controller)
  if (controller === controller2) {
    if (userData.isSqueezing === true) {
      const delta = (controller.position.y - userData.positionAtSqueezeStart) * 5;
      const scale = Math.max(0.1, userData.scaleAtSqueezeStart + delta);

      pivot.scale.setScalar(scale);
      painter.setSize(scale);
    }

    cursor.setFromMatrixPosition(pivot.matrixWorld);

    if (userData.isSelecting === true) {
      painter.lineTo(cursor);
      painter.update();
    } else {
      painter.moveTo(cursor);
    }
  }
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  handleController(controller1);
  handleController(controller2);
  
  // Update placement indicator when aiming with left controller
  updatePlacementIndicator();
  
  // Handle model rotation with left thumbstick
  handleModelRotation();

  renderer.render(scene, camera);
}

// Note: Added WebXR session handling features
// From vr-paint example and VRButton.js
function startAR() {
  const sessionInit = {
    optionalFeatures: [
      "local-floor",
      "bounded-floor",
      "hand-tracking",
      "layers"
    ]
  };
  navigator.xr
    .requestSession("immersive-ar", sessionInit)
    .then(onSessionStarted);
}

async function onSessionStarted(session) {
  session.addEventListener("end", onSessionEnded);
  session.addEventListener("inputsourceschange", onInputSourcesChange);
  //renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);
  currentSession = session;
}

function onInputSourcesChange(event) {
  inputSources = currentSession.inputSources;
}

function onSessionEnded() {
  currentSession.removeEventListener("end", onSessionEnded);
  currentSession.removeEventListener("inputsourceschange", onInputSourcesChange);
  currentSession = null;
  inputSources = [];
}
