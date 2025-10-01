// References
// https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_paint.html
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/webxr/ARButton.js
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/webxr/VRButton.js

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TubePainter } from "three/examples/jsm/misc/TubePainter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
// Import assets so Parcel includes them in the build
import closetObjUrl from "./assets/closet.obj";
import exampleCubeObjUrl from "./assets/example-cube.obj";
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

// Tool system variables
let currentTool = 0; // 0 = painter, 1 = measurement
const tools = ['Painter', 'Measurement'];
let thumbstickCooldown = 0;
let toolIndicatorMesh = null;

// Measurement tool variables
let measurementLines = [];
let currentMeasurementLine = null;
let measurementPreviewLine = null;
let measurementStartPoint = null;
let isPlacingMeasurement = false;
const snapDistance = 0.02; // 2cm snap distance

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
  objLoader.load(closetObjUrl, function(object) {
    // Set scale to 1.0 so 1 OBJ unit = 1 meter in XR
    object.scale.setScalar(1.0);
    
    // Make sure the model has proper materials
    object.traverse(function(child) {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown color
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    // Store as template but don't add to scene yet
    loadedModel = object;
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

  // Create tool indicator text (initially hidden)
  createToolIndicator();

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
    
    // Right controller (controller2) - tool usage
    if (this === controller2) {
      if (currentTool === 1) { // Measurement tool
        handleMeasurementStart();
      }
      // Painter tool is handled in handleController function
    }
  }

  function onSelectEnd() {
    this.userData.isSelecting = false;
    
    // Right controller (controller2) - measurement tool
    if (this === controller2 && currentTool === 1) {
      handleMeasurementEnd();
    }
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

  // Create different tool meshes
  const painterGeometry = new THREE.CylinderGeometry(0.01, 0.02, 0.08, 5);
  painterGeometry.rotateX(-Math.PI / 2);
  const painterMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4169E1, // Royal blue for painter
    flatShading: true 
  });
  const painterMesh = new THREE.Mesh(painterGeometry, painterMaterial);
  
  const painterPivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01, 3));
  painterPivot.name = "pivot";
  painterPivot.position.z = -0.05;
  painterMesh.add(painterPivot);

  // Measurement tool - looks like a ruler/pointer
  const measurementGroup = new THREE.Group();
  
  // Main shaft (thinner and longer)
  const rulerGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.12, 8);
  rulerGeometry.rotateX(-Math.PI / 2);
  const rulerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFF6347, // Tomato red for measurement tool
    flatShading: true 
  });
  const rulerMesh = new THREE.Mesh(rulerGeometry, rulerMaterial);
  
  // Add measurement markings (small rings)
  for (let i = 0; i < 4; i++) {
    const markGeometry = new THREE.RingGeometry(0.008, 0.012, 8);
    const markMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    });
    const mark = new THREE.Mesh(markGeometry, markMaterial);
    mark.position.z = -0.02 - (i * 0.02);
    mark.rotateX(-Math.PI / 2);
    measurementGroup.add(mark);
  }
  
  // Pointer tip
  const tipGeometry = new THREE.ConeGeometry(0.015, 0.03, 6);
  tipGeometry.rotateX(-Math.PI / 2);
  const tipMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFD700, // Gold tip
    flatShading: true 
  });
  const tipMesh = new THREE.Mesh(tipGeometry, tipMaterial);
  tipMesh.position.z = -0.08;
  
  measurementGroup.add(rulerMesh);
  measurementGroup.add(tipMesh);
  
  const measurementPivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.005, 3));
  measurementPivot.name = "pivot";
  measurementPivot.position.z = -0.08;
  measurementGroup.add(measurementPivot);

  // Add tools to controllers
  controller1.add(painterMesh.clone());
  
  // Right controller gets the active tool mesh
  controller2.userData.painterTool = painterMesh;
  controller2.userData.measurementTool = measurementGroup;
  controller2.userData.currentToolMesh = painterMesh.clone();
  controller2.add(controller2.userData.currentToolMesh);

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

function createToolIndicator() {
  // Create a canvas-based text indicator for the current tool
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;
  
  // Set up text properties
  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, 512, 128);
  context.fillStyle = '#ffffff';
  context.font = 'bold 48px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(tools[currentTool], 256, 64);
  
  // Create texture and material
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ 
    map: texture, 
    transparent: true,
    alphaTest: 0.1
  });
  
  // Create plane geometry for the indicator
  const geometry = new THREE.PlaneGeometry(0.4, 0.1);
  toolIndicatorMesh = new THREE.Mesh(geometry, material);
  
  // Position it above the right controller (will be updated in render loop)
  toolIndicatorMesh.position.set(0, 0.2, 0);
  toolIndicatorMesh.visible = false; // Initially hidden
  
  // Add to controller2 so it moves with the controller
  controller2.add(toolIndicatorMesh);
}

function updateToolIndicator() {
  if (!toolIndicatorMesh) return;
  
  // Update the canvas with current tool name
  const canvas = toolIndicatorMesh.material.map.image;
  const context = canvas.getContext('2d');
  
  // Clear and redraw
  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, 512, 128);
  
  // Set tool-specific colors
  if (currentTool === 0) {
    context.fillStyle = '#4169E1'; // Blue for painter
  } else if (currentTool === 1) {
    context.fillStyle = '#FF6347'; // Red for measurement
  }
  
  context.font = 'bold 48px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(tools[currentTool], 256, 64);
  
  // Update the texture
  toolIndicatorMesh.material.map.needsUpdate = true;
  
  // Show indicator temporarily when tool changes
  toolIndicatorMesh.visible = true;
  
  // Hide after 2 seconds
  setTimeout(() => {
    if (toolIndicatorMesh) {
      toolIndicatorMesh.visible = false;
    }
  }, 2000);
}

function createMeasurementLine(startPoint, endPoint) {
  const distance = startPoint.distanceTo(endPoint);
  
  // Create line geometry
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  
  // Create measurement text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  context.fillStyle = 'white';
  context.fillRect(0, 0, 256, 64);
  context.fillStyle = 'black';
  context.font = 'bold 24px Arial';
  context.textAlign = 'center';
  context.fillText(`${distance.toFixed(2)}m`, 128, 40);
  
  const texture = new THREE.CanvasTexture(canvas);
  const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const textGeometry = new THREE.PlaneGeometry(0.3, 0.075);
  const textMesh = new THREE.Mesh(textGeometry, textMaterial);
  
  // Position text at midpoint of line
  const midpoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
  textMesh.position.copy(midpoint);
  textMesh.position.y += 0.1; // Slightly above the line
  
  // Make text face camera
  textMesh.lookAt(camera.position);
  
  // Group line and text together
  const measurementGroup = new THREE.Group();
  measurementGroup.add(line);
  measurementGroup.add(textMesh);
  measurementGroup.userData = { startPoint, endPoint, distance };
  
  scene.add(measurementGroup);
  measurementLines.push(measurementGroup);
  
  return measurementGroup;
}

function findSnapPoint(targetPoint) {
  let closestPoint = null;
  let closestDistance = snapDistance;
  
  // Check existing measurement line endpoints
  for (let measurementLine of measurementLines) {
    const { startPoint, endPoint } = measurementLine.userData;
    
    const distToStart = targetPoint.distanceTo(startPoint);
    if (distToStart < closestDistance) {
      closestDistance = distToStart;
      closestPoint = startPoint.clone();
    }
    
    const distToEnd = targetPoint.distanceTo(endPoint);
    if (distToEnd < closestDistance) {
      closestDistance = distToEnd;
      closestPoint = endPoint.clone();
    }
  }
  
  return closestPoint;
}

function updateMeasurementPreview(controller) {
  if (!measurementStartPoint || !controller) return;
  
  // Get controller position
  const controllerPosition = new THREE.Vector3();
  controllerPosition.setFromMatrixPosition(controller.matrixWorld);
  
  // Check for snap point
  const snapPoint = findSnapPoint(controllerPosition);
  const endPoint = snapPoint || controllerPosition;
  
  // Remove old preview line
  if (measurementPreviewLine) {
    scene.remove(measurementPreviewLine);
  }
  
  // Create preview line
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([measurementStartPoint, endPoint]);
  const lineMaterial = new THREE.LineBasicMaterial({ 
    color: snapPoint ? 0x00ff00 : 0xffff00, 
    linewidth: 2,
    transparent: true,
    opacity: 0.7
  });
  measurementPreviewLine = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(measurementPreviewLine);
}

function switchTool(direction) {
  if (thumbstickCooldown > 0) return;
  
  currentTool += direction;
  if (currentTool < 0) currentTool = tools.length - 1;
  if (currentTool >= tools.length) currentTool = 0;
  
  console.log(`Switched to tool: ${tools[currentTool]}`);
  
  // Update the visual tool indicator
  updateToolIndicator();
  
  // Change the tool mesh on controller2
  if (controller2.userData.currentToolMesh) {
    controller2.remove(controller2.userData.currentToolMesh);
  }
  
  if (currentTool === 0) { // Painter tool
    controller2.userData.currentToolMesh = controller2.userData.painterTool.clone();
  } else if (currentTool === 1) { // Measurement tool
    controller2.userData.currentToolMesh = controller2.userData.measurementTool.clone();
  }
  
  controller2.add(controller2.userData.currentToolMesh);
  
  // Reset measurement state when switching tools
  if (currentTool !== 1) {
    if (measurementPreviewLine) {
      scene.remove(measurementPreviewLine);
      measurementPreviewLine = null;
    }
    measurementStartPoint = null;
    isPlacingMeasurement = false;
  }
  
  thumbstickCooldown = 0.5; // 500ms cooldown
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
      // If model isn't in scene yet, add it
      if (!placedModel) {
        placedModel = loadedModel;
        scene.add(placedModel);
      }
      
      // Move the model to the intersection point
      placedModel.position.copy(intersection.point);
      placedModel.position.y = 0; // Ensure it's on the floor
      
      console.log('Model moved to:', intersection.point);
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

function handleToolSwitching() {
  if (!currentSession) return;
  
  // Find the right controller input source
  for (let i = 0; i < inputSources.length; i++) {
    const inputSource = inputSources[i];
    if (inputSource.gamepad && inputSource.handedness === 'right') {
      const gamepad = inputSource.gamepad;
      
      // Thumbstick is typically axes 2 and 3 (x and y)
      if (gamepad.axes.length >= 4) {
        const thumbstickX = gamepad.axes[2];
        
        // Use thumbstick X for tool switching
        if (Math.abs(thumbstickX) > 0.7) { // Higher threshold for tool switching
          const direction = thumbstickX > 0 ? 1 : -1;
          switchTool(direction);
        }
      }
      break;
    }
  }
}

function handleMeasurementStart() {
  if (!measurementStartPoint) {
    // First click - set start point
    const controllerPosition = new THREE.Vector3();
    controllerPosition.setFromMatrixPosition(controller2.matrixWorld);
    
    const snapPoint = findSnapPoint(controllerPosition);
    measurementStartPoint = snapPoint || controllerPosition;
    isPlacingMeasurement = true;
    
    console.log('Measurement started');
  }
}

function handleMeasurementEnd() {
  if (measurementStartPoint && isPlacingMeasurement) {
    // Second click - create measurement line
    const controllerPosition = new THREE.Vector3();
    controllerPosition.setFromMatrixPosition(controller2.matrixWorld);
    
    const snapPoint = findSnapPoint(controllerPosition);
    const endPoint = snapPoint || controllerPosition;
    
    // Create the measurement line
    createMeasurementLine(measurementStartPoint, endPoint);
    
    // Clean up preview
    if (measurementPreviewLine) {
      scene.remove(measurementPreviewLine);
      measurementPreviewLine = null;
    }
    
    // Reset for next measurement
    measurementStartPoint = null;
    isPlacingMeasurement = false;
    
    console.log('Measurement completed');
  }
}

function handleController(controller) {
  const userData = controller.userData;
  const painter = userData.painter;

  const pivot = controller.getObjectByName("pivot");

  // Only handle painting for controller2 (right controller) when painter tool is active
  if (controller === controller2) {
    if (currentTool === 0) { // Painter tool
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
    } else if (currentTool === 1 && isPlacingMeasurement) { // Measurement tool
      updateMeasurementPreview(controller);
    }
  }
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  // Update cooldowns
  if (thumbstickCooldown > 0) {
    thumbstickCooldown -= 0.016; // Approximately 60 FPS
  }
  
  // Make tool indicator face the camera
  if (toolIndicatorMesh && toolIndicatorMesh.visible && camera) {
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    toolIndicatorMesh.lookAt(cameraPosition);
  }
  
  handleController(controller1);
  handleController(controller2);
  
  // Update placement indicator when aiming with left controller
  updatePlacementIndicator();
  
  // Handle model rotation with left thumbstick
  handleModelRotation();
  
  // Handle tool switching with right thumbstick
  handleToolSwitching();

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
