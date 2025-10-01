import * as THREE from "https://unpkg.com/three@0.157.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.157.0/examples/jsm/controls/OrbitControls.js";
import { TubePainter } from "https://unpkg.com/three@0.157.0/examples/jsm/misc/TubePainter.js";
import { OBJLoader } from "https://unpkg.com/three@0.157.0/examples/jsm/loaders/OBJLoader.js";

let camera, scene, renderer;
let controller1, controller2;
let currentSession;
const cursor = new THREE.Vector3();
let closetModel = null; // The closet object that can be moved
let raycaster = new THREE.Raycaster();
let floorPlane = null; // Invisible floor for raycasting

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

  
  // Create invisible floor plane for raycasting
  const invisibleFloorGeometry = new THREE.PlaneGeometry(20, 20);
  const invisibleFloorMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  floorPlane = new THREE.Mesh(invisibleFloorGeometry, invisibleFloorMaterial);
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.y = 0;
  scene.add(floorPlane);

  scene.add(new THREE.HemisphereLight(0x888877, 0x777788));

  const light = new THREE.DirectionalLight(0xffffff, 0.5);
  light.position.set(0, 4, 0);
  scene.add(light);

  // Load the closet model
  const objLoader = new OBJLoader();
  objLoader.load('./closet.obj', function (object) {
    closetModel = object;
    
    // Calculate bounding box to position pivot at ground level
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Adjust position so the bottom of the object is at y=0
    object.position.y = -box.min.y;
    
    // Position in front of camera
    object.position.x = 0;
    object.position.z = -2;
    
    scene.add(object);
  }, function (progress) {
    console.log('Loading progress:', progress);
  }, function (error) {
    console.error('Error loading closet model:', error);
  });

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
    
    // If this is the left controller (controller1), handle object movement
    if (this === controller1 && closetModel && floorPlane) {
      // Cast ray from controller to floor
      raycaster.setFromXRController(this);
      const intersects = raycaster.intersectObject(floorPlane);
      
      if (intersects.length > 0) {
        const intersectionPoint = intersects[0].point;
        // Move closet to intersection point, keeping its current Y position (ground level)
        closetModel.position.x = intersectionPoint.x;
        closetModel.position.z = intersectionPoint.z;
      }
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

function handleController(controller) {
  const userData = controller.userData;
  const painter = userData.painter;

  const pivot = controller.getObjectByName("pivot");

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

  // Handle left controller input for object movement and rotation
  if (controller === controller1 && closetModel && floorPlane) {
    const session = renderer.xr.getSession();
    if (session) {
      const inputSources = session.inputSources;
      for (const inputSource of inputSources) {
        if (inputSource.gamepad && inputSource.handedness === 'left') {
          const gamepad = inputSource.gamepad;
          
          // Handle thumbstick rotation (usually axes 2 and 3 are the right thumbstick)
          // For left controller, we want left thumbstick which is usually axes 0 and 1
          if (gamepad.axes.length >= 2) {
            const thumbstickX = gamepad.axes[0]; // Left/right on left thumbstick
            
            // Rotate the closet around its Y-axis based on thumbstick input
            if (Math.abs(thumbstickX) > 0.1) { // Dead zone
              closetModel.rotation.y += thumbstickX * 0.02; // Adjust rotation speed as needed
            }
          }
          
          // Handle trigger or button for movement
          if (userData.isSelecting) {
            // Cast ray from controller to floor for continuous movement while trigger held
            raycaster.setFromXRController(controller);
            const intersects = raycaster.intersectObject(floorPlane);
            
            if (intersects.length > 0) {
              const intersectionPoint = intersects[0].point;
              // Smoothly move closet to intersection point
              closetModel.position.x = intersectionPoint.x;
              closetModel.position.z = intersectionPoint.z;
            }
          }
        }
      }
    }
  }
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  handleController(controller1);
  handleController(controller2);

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
  //renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);
  currentSession = session;
}

function onSessionEnded() {
  currentSession.removeEventListener("end", onSessionEnded);
  currentSession = null;
}
