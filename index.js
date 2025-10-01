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

// Grab system variables
let grabbedModel = null;
let grabController1 = null;
let grabController2 = null;
let grabOffset1 = new THREE.Vector3();
let grabOffset2 = new THREE.Vector3();
let initialModelPosition = new THREE.Vector3();
let initialModelRotation = new THREE.Euler();
let initialControllerDistance = 0;
let initialControllerAngle = 0;

// Tool system variables
let currentTool = 0; // 0 = painter, 1 = measurement, 2 = block
const tools = ['Painter', 'Measurement', 'Block'];
let thumbstickCooldown = 0;
let toolIndicatorMesh = null;

// Block tool variables
let blockPreview = null;
let blockDimensions = { width: 0.2, height: 0.2, depth: 0.2 }; // Default 20cm cube
let placedBlocks = [];
let isPlacingBlock = false;

// Measurement tool variables
let measurementLines = [];
let currentMeasurementLine = null;
let measurementPreviewLine = null;
let measurementPreviewText = null;
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
  floor.receiveShadow = true; // Floor receives shadows
  scene.add(floor);

  /*const grid = new THREE.GridHelper(10, 20, 0x111111, 0x111111);
  grid.material.depthTest = false; // avoid z-fighting
  scene.add(grid);*/

  scene.add(new THREE.HemisphereLight(0x888877, 0x777788, 0.4)); // Reduced intensity for ambient

  const light = new THREE.DirectionalLight(0xffffff, 0.8); // Increased intensity
  light.position.set(5, 10, 5); // Better shadow casting position
  light.castShadow = true;
  
  // Configure shadow properties for better quality
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 50;
  light.shadow.camera.left = -10;
  light.shadow.camera.right = 10;
  light.shadow.camera.top = 10;
  light.shadow.camera.bottom = -10;
  light.shadow.bias = -0.0001; // Reduce shadow acne
  
  scene.add(light);

  // Load the closet.obj model
  const objLoader = new OBJLoader();
  objLoader.load(closetObjUrl, function(object) {
    // Set scale to 1.0 so 1 OBJ unit = 1 meter in XR
    object.scale.setScalar(1.0);
    
    // Make sure the model has proper materials with enhanced shading
    object.traverse(function(child) {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ 
          color: 0x8B4513, // Brown color
          roughness: 0.7,
          metalness: 0.1,
          // Add some ambient occlusion-like effect
          aoMapIntensity: 0.5
        });
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
  
  // Enable shadows
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
  
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
      } else if (currentTool === 2) { // Block tool
        handleBlockPlacement();
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
    
    // Handle grabbing
    handleGrabStart(this);
  }

  function onSqueezeEnd() {
    this.userData.isSqueezing = false;
    
    // Handle grab release
    handleGrabEnd(this);
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
    flatShading: true,
    roughness: 0.3,
    metalness: 0.8 // More metallic look
  });
  const painterMesh = new THREE.Mesh(painterGeometry, painterMaterial);
  painterMesh.castShadow = true;
  
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
    flatShading: true,
    roughness: 0.4,
    metalness: 0.6
  });
  const rulerMesh = new THREE.Mesh(rulerGeometry, rulerMaterial);
  rulerMesh.castShadow = true;
  
  // Pointer tip
  const tipGeometry = new THREE.ConeGeometry(0.015, 0.03, 6);
  tipGeometry.rotateX(-Math.PI / 2);
  const tipMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFD700, // Gold tip
    flatShading: true,
    roughness: 0.2,
    metalness: 0.9 // Very metallic gold
  });
  const tipMesh = new THREE.Mesh(tipGeometry, tipMaterial);
  tipMesh.position.z = -0.08;
  tipMesh.castShadow = true;
  
  measurementGroup.add(rulerMesh);
  measurementGroup.add(tipMesh);
  
  const measurementPivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.005, 3));
  measurementPivot.name = "pivot";
  measurementPivot.position.z = -0.08;
  measurementGroup.add(measurementPivot);

  // Block tool - looks like a small cube/rectangular tool
  const blockToolGroup = new THREE.Group();
  
  // Main handle
  const blockHandleGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8);
  blockHandleGeometry.rotateX(-Math.PI / 2);
  const blockHandleMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x32CD32, // Lime green for block tool
    flatShading: true,
    roughness: 0.3,
    metalness: 0.7
  });
  const blockHandleMesh = new THREE.Mesh(blockHandleGeometry, blockHandleMaterial);
  blockHandleMesh.castShadow = true;
  
  // Block indicator at the tip
  const blockIndicatorGeometry = new THREE.BoxGeometry(0.02, 0.02, 0.02);
  const blockIndicatorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x90EE90, // Light green
    flatShading: true,
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.8
  });
  const blockIndicatorMesh = new THREE.Mesh(blockIndicatorGeometry, blockIndicatorMaterial);
  blockIndicatorMesh.position.z = -0.08;
  blockIndicatorMesh.castShadow = true;
  
  blockToolGroup.add(blockHandleMesh);
  blockToolGroup.add(blockIndicatorMesh);
  
  const blockPivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.005, 3));
  blockPivot.name = "pivot";
  blockPivot.position.z = -0.08;
  blockToolGroup.add(blockPivot);

  // Add tools to controllers
  controller1.add(painterMesh.clone());
  
  // Right controller gets the active tool mesh
  controller2.userData.painterTool = painterMesh;
  controller2.userData.measurementTool = measurementGroup;
  controller2.userData.blockTool = blockToolGroup;
  controller2.userData.currentToolMesh = painterMesh.clone();
  controller2.add(controller2.userData.currentToolMesh);

  // Create tool indicator now that controller2 exists
  createToolIndicator();

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

function createMeasurementText(distance, midpoint, isPreview = false) {
  // Create measurement text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  
  // Different styling for preview vs final measurement
  if (isPreview) {
    context.fillStyle = 'rgba(255, 255, 0, 0.8)'; // Yellow background for preview
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = 'black';
  } else {
    context.fillStyle = 'white';
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = 'black';
  }
  
  context.font = 'bold 24px Arial';
  context.textAlign = 'center';
  context.fillText(`${distance.toFixed(2)}m`, 128, 40);
  
  const texture = new THREE.CanvasTexture(canvas);
  const textMaterial = new THREE.MeshBasicMaterial({ 
    map: texture, 
    transparent: true,
    opacity: isPreview ? 0.8 : 1.0
  });
  const textGeometry = new THREE.PlaneGeometry(0.1, 0.025);
  const textMesh = new THREE.Mesh(textGeometry, textMaterial);
  
  // Position text above the midpoint of the line
  textMesh.position.copy(midpoint);
  textMesh.position.y += 0.05; // Position above the line
  
  return textMesh;
}

function updateMeasurementTextOrientation() {
  // Update all measurement text orientations to face camera
  for (let measurementLine of measurementLines) {
    const textMesh = measurementLine.children.find(child => child.material && child.material.map);
    if (textMesh && camera) {
      const cameraPosition = new THREE.Vector3();
      camera.getWorldPosition(cameraPosition);
      textMesh.lookAt(cameraPosition);
    }
  }
  
  // Update preview text orientation
  if (measurementPreviewText && camera) {
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    measurementPreviewText.lookAt(cameraPosition);
  }
}

function findClosestModel(controller) {
  if (!placedModel) return null;
  
  const controllerPosition = new THREE.Vector3();
  controller.getWorldPosition(controllerPosition);
  
  const modelPosition = new THREE.Vector3();
  placedModel.getWorldPosition(modelPosition);
  
  const distance = controllerPosition.distanceTo(modelPosition);
  
  // Only grab if within reasonable distance (2 meters)
  if (distance < 2.0) {
    return placedModel;
  }
  
  return null;
}

function handleGrabStart(controller) {
  const model = findClosestModel(controller);
  if (!model) return;
  
  if (controller === controller1) {
    grabController1 = controller;
    
    // Calculate offset from controller to model
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const modelPos = new THREE.Vector3();
    model.getWorldPosition(modelPos);
    grabOffset1.subVectors(modelPos, controllerPos);
    
  } else if (controller === controller2) {
    grabController2 = controller;
    
    // Calculate offset from controller to model
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const modelPos = new THREE.Vector3();
    model.getWorldPosition(modelPos);
    grabOffset2.subVectors(modelPos, controllerPos);
  }
  
  // If this is the first grab or both controllers are now grabbing
  if (!grabbedModel || (grabController1 && grabController2)) {
    grabbedModel = model;
    
    // Store initial state for dual-controller manipulation
    if (grabController1 && grabController2) {
      initialModelPosition.copy(model.position);
      initialModelRotation.copy(model.rotation);
      
      const pos1 = new THREE.Vector3();
      const pos2 = new THREE.Vector3();
      grabController1.getWorldPosition(pos1);
      grabController2.getWorldPosition(pos2);
      
      initialControllerDistance = pos1.distanceTo(pos2);
      
      // Calculate initial angle between controllers on XZ plane
      const diff = new THREE.Vector3().subVectors(pos2, pos1);
      initialControllerAngle = Math.atan2(diff.z, diff.x);
    }
  }
  
  console.log(`Grabbed model with ${controller === controller1 ? 'left' : 'right'} controller`);
}

function handleGrabEnd(controller) {
  if (controller === controller1) {
    grabController1 = null;
  } else if (controller === controller2) {
    grabController2 = null;
  }
  
  // If no controllers are grabbing, release the model
  if (!grabController1 && !grabController2) {
    grabbedModel = null;
    console.log('Released model');
  }
  
  console.log(`Released ${controller === controller1 ? 'left' : 'right'} controller grab`);
}

function updateGrabbedModel() {
  if (!grabbedModel) return;
  
  if (grabController1 && grabController2) {
    // Dual controller manipulation - move and rotate
    const pos1 = new THREE.Vector3();
    const pos2 = new THREE.Vector3();
    grabController1.getWorldPosition(pos1);
    grabController2.getWorldPosition(pos2);
    
    // Calculate center point between controllers
    const centerPoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
    
    // Apply offsets and set position
    const avgOffset = new THREE.Vector3().addVectors(grabOffset1, grabOffset2).multiplyScalar(0.5);
    grabbedModel.position.copy(centerPoint.add(avgOffset));
    
    // Calculate rotation based on controller orientation
    const currentDistance = pos1.distanceTo(pos2);
    const diff = new THREE.Vector3().subVectors(pos2, pos1);
    const currentAngle = Math.atan2(diff.z, diff.x);
    
    // Apply rotation difference
    const angleDiff = currentAngle - initialControllerAngle;
    grabbedModel.rotation.y = initialModelRotation.y + angleDiff;
    
    // Optional: Scale based on distance change (uncomment if desired)
    // const scaleRatio = currentDistance / initialControllerDistance;
    // grabbedModel.scale.setScalar(Math.max(0.5, Math.min(2.0, scaleRatio)));
    
  } else if (grabController1) {
    // Single controller manipulation - just move
    const controllerPos = new THREE.Vector3();
    grabController1.getWorldPosition(controllerPos);
    grabbedModel.position.copy(controllerPos.add(grabOffset1));
    
  } else if (grabController2) {
    // Single controller manipulation - just move
    const controllerPos = new THREE.Vector3();
    grabController2.getWorldPosition(controllerPos);
    grabbedModel.position.copy(controllerPos.add(grabOffset2));
  }
}

function createBlockPreview() {
  if (blockPreview) {
    scene.remove(blockPreview);
  }
  
  const geometry = new THREE.BoxGeometry(blockDimensions.width, blockDimensions.height, blockDimensions.depth);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x32CD32,
    transparent: true,
    opacity: 0.5,
    roughness: 0.3,
    metalness: 0.7
  });
  
  blockPreview = new THREE.Mesh(geometry, material);
  blockPreview.castShadow = true;
  blockPreview.receiveShadow = true;
  scene.add(blockPreview);
}

function updateBlockPreview(controller) {
  if (!blockPreview) {
    createBlockPreview();
  }
  
  // Get controller position and direction
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  // Check intersection with floor and other objects
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  let foundHit = false;
  for (let i = 0; i < intersects.length; i++) {
    const intersection = intersects[i];
    
    // Skip if hitting the preview itself or tool indicators
    if (intersection.object === blockPreview || 
        intersection.object.parent === controller ||
        intersection.object === toolIndicatorMesh) {
      continue;
    }
    
    // Position the preview at the intersection point
    blockPreview.position.copy(intersection.point);
    blockPreview.position.y += blockDimensions.height / 2; // Center the block on the surface
    blockPreview.visible = true;
    foundHit = true;
    break;
  }
  
  if (!foundHit) {
    blockPreview.visible = false;
  }
}

function handleBlockPlacement() {
  if (!blockPreview || !blockPreview.visible) return;
  
  // Create a permanent block at the preview position
  const geometry = new THREE.BoxGeometry(blockDimensions.width, blockDimensions.height, blockDimensions.depth);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x32CD32,
    roughness: 0.3,
    metalness: 0.7
  });
  
  const block = new THREE.Mesh(geometry, material);
  block.position.copy(blockPreview.position);
  block.castShadow = true;
  block.receiveShadow = true;
  
  scene.add(block);
  placedBlocks.push(block);
  
  console.log(`Placed block: ${blockDimensions.width}×${blockDimensions.height}×${blockDimensions.depth}m`);
}

function adjustBlockDimensions(inputSource) {
  if (!inputSource.gamepad || inputSource.handedness !== 'right') return;
  
  const gamepad = inputSource.gamepad;
  if (gamepad.axes.length >= 4) {
    const thumbstickY = gamepad.axes[3]; // Y axis for height
    
    // Adjust height with right thumbstick Y (up/down)
    if (Math.abs(thumbstickY) > 0.3) {
      const adjustment = thumbstickY * 0.002; // 2mm per frame
      blockDimensions.height = Math.max(0.05, Math.min(2.0, blockDimensions.height + adjustment));
    }
  }
  
  // Use buttons for width and depth adjustment
  if (gamepad.buttons.length > 4) {
    // A button (button 0) - increase width
    if (gamepad.buttons[0].pressed) {
      blockDimensions.width = Math.min(2.0, blockDimensions.width + 0.002);
    }
    // B button (button 1) - decrease width  
    if (gamepad.buttons[1].pressed) {
      blockDimensions.width = Math.max(0.05, blockDimensions.width - 0.002);
    }
    // X button (button 2) - increase depth
    if (gamepad.buttons[2].pressed) {
      blockDimensions.depth = Math.min(2.0, blockDimensions.depth + 0.002);
    }
    // Y button (button 3) - decrease depth
    if (gamepad.buttons[3].pressed) {
      blockDimensions.depth = Math.max(0.05, blockDimensions.depth - 0.002);
    }
  }
  
  // Update preview if it exists
  if (blockPreview && currentTool === 2) {
    scene.remove(blockPreview);
    blockPreview = null;
    createBlockPreview();
  }
}

function updateToolIndicator() {
  if (!toolIndicatorMesh) return;
  
  // Update the canvas with current tool name
  const canvas = toolIndicatorMesh.material.map.image;
  const context = canvas.getContext('2d');
  
  // Clear the entire canvas first
  context.clearRect(0, 0, 512, 128);
  
  // Draw background
  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, 512, 128);
  
  // Set tool-specific colors
  if (currentTool === 0) {
    context.fillStyle = '#4169E1'; // Blue for painter
  } else if (currentTool === 1) {
    context.fillStyle = '#FF6347'; // Red for measurement
  } else if (currentTool === 2) {
    context.fillStyle = '#32CD32'; // Green for block tool
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
  
  // Create measurement text using helper function
  const midpoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
  const textMesh = createMeasurementText(distance, midpoint, false);
  
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

function getTipPosition(controller) {
  // Get the tip position from the measurement tool
  // The cone tip is at z = -0.08 (cone position) - 0.015 (half cone height) = -0.095
  const tipPosition = new THREE.Vector3(0, 0, -0.095);
  
  // Transform to world space
  const worldMatrix = controller.matrixWorld;
  tipPosition.applyMatrix4(worldMatrix);
  
  return tipPosition;
}

function updateMeasurementPreview(controller) {
  if (!measurementStartPoint || !controller) return;
  
  // Get tip position when using measurement tool
  const tipPosition = currentTool === 1 ? getTipPosition(controller) : 
                     new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
  
  // Check for snap point
  const snapPoint = findSnapPoint(tipPosition);
  const endPoint = snapPoint || tipPosition;
  
  // Remove old preview line and text
  if (measurementPreviewLine) {
    scene.remove(measurementPreviewLine);
  }
  if (measurementPreviewText) {
    scene.remove(measurementPreviewText);
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
  
  // Create preview text with distance
  const distance = measurementStartPoint.distanceTo(endPoint);
  const midpoint = new THREE.Vector3().addVectors(measurementStartPoint, endPoint).multiplyScalar(0.5);
  measurementPreviewText = createMeasurementText(distance, midpoint, true);
  
  // Make preview text face camera immediately
  if (camera) {
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    measurementPreviewText.lookAt(cameraPosition);
  }
  
  scene.add(measurementPreviewText);
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
  } else if (currentTool === 2) { // Block tool
    controller2.userData.currentToolMesh = controller2.userData.blockTool.clone();
  }
  
  controller2.add(controller2.userData.currentToolMesh);
  
  // Reset measurement state when switching tools
  if (currentTool !== 1) {
    if (measurementPreviewLine) {
      scene.remove(measurementPreviewLine);
      measurementPreviewLine = null;
    }
    if (measurementPreviewText) {
      scene.remove(measurementPreviewText);
      measurementPreviewText = null;
    }
    measurementStartPoint = null;
    isPlacingMeasurement = false;
  }
  
  // Reset block state when switching tools
  if (currentTool !== 2) {
    if (blockPreview) {
      scene.remove(blockPreview);
      blockPreview = null;
    }
    isPlacingBlock = false;
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
    // First click - set start point from tip position
    const tipPosition = currentTool === 1 ? getTipPosition(controller2) : 
                       new THREE.Vector3().setFromMatrixPosition(controller2.matrixWorld);
    
    const snapPoint = findSnapPoint(tipPosition);
    measurementStartPoint = snapPoint || tipPosition;
    isPlacingMeasurement = true;
    
    console.log('Measurement started');
  }
}

function handleMeasurementEnd() {
  if (measurementStartPoint && isPlacingMeasurement) {
    // Second click - create measurement line from tip position
    const tipPosition = currentTool === 1 ? getTipPosition(controller2) : 
                       new THREE.Vector3().setFromMatrixPosition(controller2.matrixWorld);
    
    const snapPoint = findSnapPoint(tipPosition);
    const endPoint = snapPoint || tipPosition;
    
    // Create the measurement line
    createMeasurementLine(measurementStartPoint, endPoint);
    
    // Clean up preview
    if (measurementPreviewLine) {
      scene.remove(measurementPreviewLine);
      measurementPreviewLine = null;
    }
    if (measurementPreviewText) {
      scene.remove(measurementPreviewText);
      measurementPreviewText = null;
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

  // Only handle painting for controller2 (right controller) when painter tool is active and not grabbing
  if (controller === controller2 && !grabbedModel) {
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
    } else if (currentTool === 2) { // Block tool
      updateBlockPreview(controller);
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
  
  // Update measurement text orientations to always face camera
  updateMeasurementTextOrientation();
  
  // Update grabbed model position/rotation
  updateGrabbedModel();
  
  handleController(controller1);
  handleController(controller2);
  
  // Update placement indicator when aiming with left controller
  updatePlacementIndicator();
  
  // Handle model rotation with left thumbstick
  handleModelRotation();
  
  // Handle tool switching with right thumbstick
  handleToolSwitching();
  
  // Handle block dimension adjustments when using block tool
  if (currentTool === 2 && currentSession) {
    for (let i = 0; i < inputSources.length; i++) {
      const inputSource = inputSources[i];
      if (inputSource.gamepad && inputSource.handedness === 'right') {
        adjustBlockDimensions(inputSource);
        break;
      }
    }
  }

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
