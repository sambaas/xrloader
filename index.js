// References
// https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_paint.html
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/webxr/ARButton.js
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/webxr/VRButton.js

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

// Custom lightweight painter implementation
class CustomPainter {
  constructor() {
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.positions = [];
    this.colors = [];
    this.size = 0.01;
    this.color = new THREE.Color(0.5, 0.5, 1);
    this.isDrawing = false;
    this.lastPosition = new THREE.Vector3();
    this.segmentLength = 0.005; // Minimum distance between points
    
    this.init();
  }
  
  init() {
    // Create geometry with initial capacity
    this.geometry = new THREE.BufferGeometry();
    
    // Create material
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    
    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    
    // Initialize empty buffers
    this.updateGeometry();
  }
  
  setSize(size) {
    this.size = size;
  }
  
  setColor(color) {
    if (color instanceof THREE.Color) {
      this.color.copy(color);
    } else {
      this.color.setHex(color);
    }
  }
  
  moveTo(position) {
    this.lastPosition.copy(position);
    this.isDrawing = false;
  }
  
  lineTo(position) {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.addPoint(this.lastPosition);
    }
    
    // Only add point if we've moved enough distance
    const distance = position.distanceTo(this.lastPosition);
    if (distance > this.segmentLength) {
      this.addPoint(position);
      this.lastPosition.copy(position);
    }
  }
  
  addPoint(position) {
    const segments = 8; // Number of segments around the tube
    const radius = this.size;
    
    // Generate points around the tube circumference
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = position.x + Math.cos(angle) * radius;
      const y = position.y + Math.sin(angle) * radius;
      const z = position.z;
      
      this.positions.push(x, y, z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }
  
  update() {
    this.updateGeometry();
  }
  
  updateGeometry() {
    if (this.positions.length === 0) {
      // Create minimal empty geometry
      this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      this.geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
      this.geometry.setDrawRange(0, 0);
      return;
    }
    
    // Update position attribute
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    
    // Generate indices for triangle strips
    const indices = [];
    const pointsPerRing = 8;
    const rings = Math.floor(this.positions.length / (pointsPerRing * 3));
    
    for (let ring = 0; ring < rings - 1; ring++) {
      for (let i = 0; i < pointsPerRing; i++) {
        const current = ring * pointsPerRing + i;
        const next = ring * pointsPerRing + ((i + 1) % pointsPerRing);
        const nextRing = (ring + 1) * pointsPerRing + i;
        const nextRingNext = (ring + 1) * pointsPerRing + ((i + 1) % pointsPerRing);
        
        // Two triangles per segment
        indices.push(current, next, nextRing);
        indices.push(next, nextRingNext, nextRing);
      }
    }
    
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
  
  reset() {
    this.positions = [];
    this.colors = [];
    this.isDrawing = false;
    this.updateGeometry();
  }
  
  dispose() {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
  }
}

// Import assets so Parcel includes them in the build
import closetObjUrl from "./assets/closet.obj";

// =====================================
// GLOBAL VARIABLES
// =====================================

// Core Three.js variables
let camera, scene, renderer, controls;
let controller1, controller2;
let currentSession;
const cursor = new THREE.Vector3();

// Model management variables
let loadedModel = null;
let placedModel = null;
let modelPlacementIndicator = null;
let raycaster = new THREE.Raycaster();
let inputSources = [];

// Model catalog and placement system
let availableModels = []; // Will store loaded model templates
let currentModelIndex = 0;
let modelPreview = null;
let placedModels = []; // Track all placed model instances

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
let currentTool = 0; // 0 = painter, 1 = measurement, 2 = eraser
const tools = ['Painter', 'Measurement', 'Eraser'];
let thumbstickCooldown = 0;
let buttonCooldown = 0;
let toolIndicatorMesh = null;

// Paint group tracking
let paintGroups = []; // Array to store all paint group meshes
let activePaintGroups = new Map(); // Track active paint groups per controller

// Measurement tool variables
let measurementLines = [];
let currentMeasurementLine = null;
let measurementPreviewLine = null;
let measurementPreviewText = null;
let measurementStartPoint = null;
let isPlacingMeasurement = false;
const snapDistance = 0.02; // 2cm snap distance

// =====================================
// INITIALIZATION
// =====================================

init();
animate();

function init() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();
  // Note: We need background to be transparent for passthrough to work!

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
  
  // Create a shadow-only material using ShadowMaterial
  const floorMaterial = new THREE.ShadowMaterial({
    opacity: 0.3, // Adjust shadow darkness (0 = invisible, 1 = black)
    transparent: true
  });
  
  const floor = new THREE.Mesh(floorGometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true; // Floor receives shadows
  // Add a name to identify the floor for debugging
  floor.name = 'floor';
  scene.add(floor);

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
    
    // Add to model catalog
    availableModels.push({
      name: 'Closet',
      template: object,
      url: closetObjUrl
    });
    
    // Set as current loaded model for backwards compatibility
    loadedModel = object;
    
    // Create initial preview
    createModelPreview();
    
    console.log('Closet model loaded successfully');
  }, undefined, function(error) {
    console.error('Error loading closet model:', error);
  });

  // Create placement indicator (a simple ring)
  const indicatorGeometry = new THREE.RingGeometry(0.15, 0.175, 16); // Half the original size
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

  const painter1 = new CustomPainter();
  scene.add(painter1.mesh);

  const painter2 = new CustomPainter();
  scene.add(painter2.mesh);

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

  // Controllers
  function onSelectStart() {
    this.userData.isSelecting = true;
    
    // Left controller (controller1) - model placement (but only when not actively painting)
    if (this === controller1 && availableModels.length > 0) {
      // Don't place models if we're actively painting
      if (!activePaintGroups.has(this)) {
        handleModelPlacement();
      }
    }
    
    // Right controller (controller2) - tool usage
    if (this === controller2) {
      if (currentTool === 1) { // Measurement tool
        handleMeasurementStart();
      } else if (currentTool === 2) { // Eraser tool
        handleEraserAction();
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

  // Left controller painter mesh (green to match placement indicator)
  const leftPainterMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, // Green to match placement indicator
    flatShading: true,
    roughness: 0.3,
    metalness: 0.8 // More metallic look
  });
  const leftPainterMesh = new THREE.Mesh(painterGeometry, leftPainterMaterial);
  leftPainterMesh.castShadow = true;
  
  const leftPainterPivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01, 3));
  leftPainterPivot.name = "pivot";
  leftPainterPivot.position.z = -0.05;
  leftPainterMesh.add(leftPainterPivot);

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

  // Eraser tool - looks like a small cube/eraser
  const eraserGroup = new THREE.Group();
  
  // Main handle
  const eraserHandleGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8);
  eraserHandleGeometry.rotateX(-Math.PI / 2);
  const eraserHandleMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFF69B4, // Hot pink for eraser tool
    flatShading: true,
    roughness: 0.3,
    metalness: 0.7
  });
  const eraserHandleMesh = new THREE.Mesh(eraserHandleGeometry, eraserHandleMaterial);
  eraserHandleMesh.castShadow = true;
  
  // Eraser tip - a small cube like a real eraser
  const eraserTipGeometry = new THREE.BoxGeometry(0.025, 0.015, 0.015);
  const eraserTipMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFB6C1, // Light pink eraser tip
    flatShading: true,
    roughness: 0.4,
    metalness: 0.2
  });
  const eraserTipMesh = new THREE.Mesh(eraserTipGeometry, eraserTipMaterial);
  eraserTipMesh.position.z = -0.08;
  eraserTipMesh.castShadow = true;
  
  eraserGroup.add(eraserHandleMesh);
  eraserGroup.add(eraserTipMesh);
  
  const eraserPivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.005, 3));
  eraserPivot.name = "pivot";
  eraserPivot.position.z = -0.08;
  eraserGroup.add(eraserPivot);

  // Add tools to controllers
  controller1.add(leftPainterMesh); // Use green painter mesh for left controller
  
  // Right controller gets the active tool mesh
  controller2.userData.painterTool = painterMesh;
  controller2.userData.measurementTool = measurementGroup;
  controller2.userData.eraserTool = eraserGroup;
  controller2.userData.currentToolMesh = painterMesh.clone();
  controller2.add(controller2.userData.currentToolMesh);

  // Create tool indicator now that controller2 exists
  createToolIndicator();

  window.addEventListener("resize", onWindowResize);

  // Note: Click HTML button to start session
  let arButton = document.querySelector("button");
  arButton.onclick = startAR;
}

// =====================================
// CORE FUNCTIONS
// =====================================

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

// =====================================
// TOOL INDICATOR SYSTEM
// =====================================

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

// =====================================
// MEASUREMENT TOOL SYSTEM
// =====================================

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

// =====================================
// PAINT GROUP MANAGEMENT
// =====================================

function startPaintGroup(controller, painter) {
  // Create a new group to hold this paint stroke
  const paintGroup = new THREE.Group();
  paintGroup.userData = {
    controller: controller,
    painter: painter,
    startTime: Date.now(),
    isActive: true
  };
  
  // Store reference to the active paint group
  activePaintGroups.set(controller, paintGroup);
  
  console.log('Started new paint group');
}

function endPaintGroup(controller) {
  const paintGroup = activePaintGroups.get(controller);
  if (!paintGroup) return;
  
  const painter = paintGroup.userData.painter;
  
  // Clone the current painter mesh and add it to our group
  if (painter.mesh && painter.positions.length > 0) {
    // Create a complete copy of the current geometry for the paint group
    const clonedGeometry = painter.geometry.clone();
    const paintMesh = painter.mesh.clone();
    paintMesh.geometry = clonedGeometry;
    
    // Add the paint mesh to our group
    paintGroup.add(paintMesh);
    
    // Add the group to scene and track it
    scene.add(paintGroup);
    paintGroups.push(paintGroup);
    
    // Reset the painter for new strokes
    painter.reset();
  }
  
  // Remove from active groups
  activePaintGroups.delete(controller);
  paintGroup.userData.isActive = false;
  
  console.log('Ended paint group, total groups:', paintGroups.length);
}

// =====================================
// GRAB SYSTEM
// =====================================

function findClosestModel(controller) {
  if (placedModels.length === 0) return null;
  
  const controllerPosition = new THREE.Vector3();
  controller.getWorldPosition(controllerPosition);
  
  let closestModel = null;
  let closestDistance = Infinity;
  
  for (let model of placedModels) {
    const modelPosition = new THREE.Vector3();
    model.getWorldPosition(modelPosition);
    const distance = controllerPosition.distanceTo(modelPosition);
    
    // Only grab if within reasonable distance (2 meters)
    if (distance < 2.0 && distance < closestDistance) {
      closestDistance = distance;
      closestModel = model;
    }
  }
  
  return closestModel;
}

function findClosestModelToBothControllers() {
  if (placedModels.length === 0 || !controller1 || !controller2) return null;
  
  const pos1 = new THREE.Vector3();
  const pos2 = new THREE.Vector3();
  controller1.getWorldPosition(pos1);
  controller2.getWorldPosition(pos2);
  
  // Calculate midpoint between controllers
  const midpoint = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
  
  let closestModel = null;
  let closestDistance = Infinity;
  
  for (let model of placedModels) {
    const modelPosition = new THREE.Vector3();
    model.getWorldPosition(modelPosition);
    const distance = midpoint.distanceTo(modelPosition);
    
    // Only consider models within reasonable distance (3 meters from midpoint)
    if (distance < 3.0 && distance < closestDistance) {
      closestDistance = distance;
      closestModel = model;
    }
  }
  
  return closestModel;
}

function handleGrabStart(controller) {
  // When starting a grab, we need to determine which model to grab
  let targetModel = null;
  
  // If this is the first controller to grab, find closest model to this controller
  if (!grabController1 && !grabController2) {
    targetModel = findClosestModel(controller);
  } 
  // If the other controller is already grabbing, we should grab the same model if it's reasonably close
  else if (grabbedModel) {
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const modelPos = new THREE.Vector3();
    grabbedModel.getWorldPosition(modelPos);
    const distance = controllerPos.distanceTo(modelPos);
    
    // Only grab the same model if it's within reasonable distance (3 meters)
    if (distance < 3.0) {
      targetModel = grabbedModel;
    } else {
      // Too far, grab closest model to this controller instead
      targetModel = findClosestModel(controller);
    }
  }
  
  if (!targetModel) return;
  
  if (controller === controller1) {
    grabController1 = controller;
    
    // Calculate offset from controller to model
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const modelPos = new THREE.Vector3();
    targetModel.getWorldPosition(modelPos);
    grabOffset1.subVectors(modelPos, controllerPos);
    
  } else if (controller === controller2) {
    grabController2 = controller;
    
    // Calculate offset from controller to model
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);
    const modelPos = new THREE.Vector3();
    targetModel.getWorldPosition(modelPos);
    grabOffset2.subVectors(modelPos, controllerPos);
  }
  
  // Set or update the grabbed model
  grabbedModel = targetModel;
  
  // Store initial state for dual-controller manipulation
  if (grabController1 && grabController2) {
    initialModelPosition.copy(grabbedModel.position);
    initialModelRotation.copy(grabbedModel.rotation);
    
    const pos1 = new THREE.Vector3();
    const pos2 = new THREE.Vector3();
    grabController1.getWorldPosition(pos1);
    grabController2.getWorldPosition(pos2);
    
    initialControllerDistance = pos1.distanceTo(pos2);
    
    // Calculate initial angle between controllers on XZ plane
    const diff = new THREE.Vector3().subVectors(pos2, pos1);
    initialControllerAngle = Math.atan2(diff.z, diff.x);
    
    console.log('Dual-controller grab established for rotation');
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
    
    // Apply rotation difference (reversed direction)
    const angleDiff = initialControllerAngle - currentAngle;
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
    context.fillStyle = '#FF69B4'; // Hot pink for eraser
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

function findClosestMeasurementLine(controllerPosition) {
  if (measurementLines.length === 0) return null;
  
  let closestLine = null;
  let closestDistance = Infinity;
  
  for (let measurementLine of measurementLines) {
    const { startPoint, endPoint } = measurementLine.userData;
    
    // Calculate distance from controller to the line segment (not just midpoint)
    const line = new THREE.Line3(startPoint, endPoint);
    const closestPoint = new THREE.Vector3();
    line.closestPointToPoint(controllerPosition, true, closestPoint);
    const distance = controllerPosition.distanceTo(closestPoint);
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestLine = measurementLine;
    }
  }
  
  return { line: closestLine, distance: closestDistance };
}

function removeMeasurementLine(measurementLine) {
  if (!measurementLine) return false;
  
  // Remove from scene
  scene.remove(measurementLine);
  
  // Remove from measurementLines array
  const index = measurementLines.indexOf(measurementLine);
  if (index > -1) {
    measurementLines.splice(index, 1);
  }
  
  console.log('Removed measurement line');
  return true;
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
  } else if (currentTool === 2) { // Eraser tool
    controller2.userData.currentToolMesh = controller2.userData.eraserTool.clone();
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
  
  thumbstickCooldown = 0.5; // 500ms cooldown
}

// =====================================
// MODEL CATALOG AND PREVIEW SYSTEM
// =====================================

function createModelPreview() {
  // Remove existing preview
  if (modelPreview) {
    if (controller1.children.includes(modelPreview)) {
      controller1.remove(modelPreview);
    } else {
      scene.remove(modelPreview);
    }
    modelPreview = null;
  }
  
  // Create preview if we have models available
  if (availableModels.length > 0 && controller1) {
    const currentModel = availableModels[currentModelIndex];
    modelPreview = currentModel.template.clone();
    
    // Calculate the bounding box to determine scale for 3cm max height
    const box = new THREE.Box3().setFromObject(modelPreview);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const targetMaxSize = 0.03; // 3cm in meters
    const scale = targetMaxSize / maxDimension;
    
    modelPreview.scale.setScalar(scale);
    modelPreview.position.set(0, 0.02, 0); // Position 2cm above controller
    
    // Make all materials semi-transparent for preview
    modelPreview.traverse(function(child) {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.6;
        child.castShadow = false; // Don't cast shadows for preview
      }
    });
    
    // Add to controller so it moves with it
    controller1.add(modelPreview);
    console.log(`Preview created for: ${currentModel.name}`);
  }
}

function switchModel(direction) {
  if (availableModels.length === 0) return;
  
  currentModelIndex += direction;
  if (currentModelIndex < 0) currentModelIndex = availableModels.length - 1;
  if (currentModelIndex >= availableModels.length) currentModelIndex = 0;
  
  console.log(`Switched to model: ${availableModels[currentModelIndex].name}`);
  
  // Update preview
  createModelPreview();
  
  // Update loadedModel for backwards compatibility
  loadedModel = availableModels[currentModelIndex].template;
}

function findClosestPlacedModel(controllerPosition) {
  if (placedModels.length === 0) return null;
  
  let closestModel = null;
  let closestDistance = Infinity;
  
  for (let model of placedModels) {
    // Create bounding box for the model
    const boundingBox = new THREE.Box3().setFromObject(model);
    
    // Check if controller position is inside the bounding box
    if (boundingBox.containsPoint(controllerPosition)) {
      return { model: model, distance: 0 }; // Inside the object
    }
    
    // If not inside, calculate distance to the bounding box
    const closestPoint = boundingBox.clampPoint(controllerPosition, new THREE.Vector3());
    const distance = controllerPosition.distanceTo(closestPoint);
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestModel = model;
    }
  }
  
  return { model: closestModel, distance: closestDistance };
}

function removePlacedModel(model) {
  if (!model) return false;
  
  // Remove from scene
  scene.remove(model);
  
  // Remove from placedModels array
  const index = placedModels.indexOf(model);
  if (index > -1) {
    placedModels.splice(index, 1);
  }
  
  console.log('Removed placed model');
  return true;
}

function findClosestPaintGroup(controllerPosition) {
  let closestPaintGroup = null;
  let closestDistance = Infinity;
  
  for (let paintGroup of paintGroups) {
    if (!paintGroup.children.length) continue;
    
    // Check each paint mesh in the group
    for (let paintMesh of paintGroup.children) {
      if (!paintMesh.geometry || !paintMesh.geometry.attributes.position) continue;
      
      // Create bounding box for the paint mesh
      const boundingBox = new THREE.Box3().setFromObject(paintMesh);
      
      // Check if controller position is inside the bounding box
      if (boundingBox.containsPoint(controllerPosition)) {
        return { group: paintGroup, distance: 0 }; // Inside the paint
      }
      
      // If not inside, calculate distance to the bounding box
      const closestPoint = boundingBox.clampPoint(controllerPosition, new THREE.Vector3());
      const distance = controllerPosition.distanceTo(closestPoint);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPaintGroup = paintGroup;
      }
    }
  }
  
  return { group: closestPaintGroup, distance: closestDistance };
}

function removePaintGroup(paintGroup) {
  if (!paintGroup) return false;
  
  try {
    // Remove from scene
    scene.remove(paintGroup);
    
    // Remove from paintGroups array
    const index = paintGroups.indexOf(paintGroup);
    if (index > -1) {
      paintGroups.splice(index, 1);
    }
    
    console.log('Removed paint group, remaining groups:', paintGroups.length);
    return true;
  } catch (error) {
    console.error('Error removing paint group:', error);
    return false;
  }
}

// =====================================
// MODEL PLACEMENT SYSTEM
// =====================================

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
      // Create a new copy of the model
      const newModel = loadedModel.clone();
      
      // Restore full opacity and shadows for placed model
      newModel.traverse(function(child) {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.transparent = false;
          child.material.opacity = 1.0;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      // Position the new model
      newModel.position.copy(intersection.point);
      newModel.position.y = 0; // Ensure it's on the floor
      newModel.scale.setScalar(1.0); // Reset to full size
      
      // Add to scene and track it
      scene.add(newModel);
      placedModels.push(newModel);
      
      console.log('Placed new model at:', intersection.point);
      break;
    }
  }
}

function updatePlacementIndicator() {
  if (availableModels.length === 0 || !controller1) return;
  
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

// =====================================
// INPUT HANDLING
// =====================================

function handleModelSelection() {
  if (!currentSession || thumbstickCooldown > 0) return;
  
  // Find the left controller input source
  for (let i = 0; i < inputSources.length; i++) {
    const inputSource = inputSources[i];
    if (inputSource.gamepad && inputSource.handedness === 'left') {
      const gamepad = inputSource.gamepad;
      
      // Thumbstick is typically axes 2 and 3 (x and y)
      if (gamepad.axes.length >= 4) {
        const thumbstickX = gamepad.axes[2];
        
        // Use thumbstick X for model selection
        if (Math.abs(thumbstickX) > 0.7) { // Higher threshold for model switching
          const direction = thumbstickX > 0 ? 1 : -1;
          switchModel(direction);
          thumbstickCooldown = 0.5; // 500ms cooldown to prevent rapid switching
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

function handleEraserAction() {
  if (!controller2) return;
  
  const controllerPosition = new THREE.Vector3();
  controller2.getWorldPosition(controllerPosition);
  
  // Find closest measurement line, model, and paint groups
  const closestLineResult = findClosestMeasurementLine(controllerPosition);
  const closestModelResult = findClosestPlacedModel(controllerPosition);
  const closestPaintGroupResult = findClosestPaintGroup(controllerPosition);
  
  // Determine which is closer and remove it
  let lineDistance = closestLineResult ? closestLineResult.distance : Infinity;
  let modelDistance = closestModelResult ? closestModelResult.distance : Infinity;
  let paintDistance = closestPaintGroupResult ? closestPaintGroupResult.distance : Infinity;
  
  // Eraser range - but prioritize objects that contain the eraser point
  const eraserRange = 0.1; // 10cm range for eraser
  const paintEraserRange = 0.08; // 8cm range for paint groups
  
  // Check if eraser is inside any object (distance = 0 means inside)
  if (modelDistance === 0) {
    removePlacedModel(closestModelResult.model);
    console.log('Erased placed model (inside bounds)');
  } else if (paintDistance === 0) {
    removePaintGroup(closestPaintGroupResult.group);
    console.log('Erased paint group (inside bounds)');
  } else if (paintDistance < lineDistance && paintDistance < modelDistance && closestPaintGroupResult && closestPaintGroupResult.group && paintDistance < paintEraserRange) {
    removePaintGroup(closestPaintGroupResult.group);
    console.log('Erased paint group');
  } else if (lineDistance < modelDistance && closestLineResult && closestLineResult.line && lineDistance < eraserRange) {
    removeMeasurementLine(closestLineResult.line);
    console.log('Erased measurement line');
  } else if (closestModelResult && closestModelResult.model && modelDistance < eraserRange) {
    removePlacedModel(closestModelResult.model);
    console.log('Erased placed model (near bounds)');
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

// =====================================
// RENDERING & ANIMATION
// =====================================

function handleController(controller) {
  const userData = controller.userData;
  const painter = userData.painter;

  const pivot = controller.getObjectByName("pivot");

  // Handle painting for both controllers when painter tool is active and not grabbing
  if (!grabbedModel) {
    // Right controller - only when painter tool is active
    if (controller === controller2 && currentTool === 0) {
      if (userData.isSqueezing === true) {
        const delta = (controller.position.y - userData.positionAtSqueezeStart) * 5;
        const scale = Math.max(0.1, userData.scaleAtSqueezeStart + delta);

        pivot.scale.setScalar(scale);
        painter.setSize(scale);
      }

      cursor.setFromMatrixPosition(pivot.matrixWorld);

      if (userData.isSelecting === true) {
        // Start a new paint group if this is the beginning of a stroke
        if (!activePaintGroups.has(controller)) {
          startPaintGroup(controller, painter);
        }
        
        painter.lineTo(cursor);
        painter.update();
      } else {
        // End the paint group when selection ends
        if (activePaintGroups.has(controller)) {
          endPaintGroup(controller);
        }
        painter.moveTo(cursor);
      }
    } 
    // Left controller - always available for painting (placement controller can also paint)
    else if (controller === controller1) {
      if (userData.isSqueezing === true) {
        const delta = (controller.position.y - userData.positionAtSqueezeStart) * 5;
        const scale = Math.max(0.1, userData.scaleAtSqueezeStart + delta);

        pivot.scale.setScalar(scale);
        painter.setSize(scale);
      }

      cursor.setFromMatrixPosition(pivot.matrixWorld);

      if (userData.isSelecting === true) {
        // Start a new paint group if this is the beginning of a stroke
        if (!activePaintGroups.has(controller)) {
          startPaintGroup(controller, painter);
        }
        
        painter.lineTo(cursor);
        painter.update();
      } else {
        // End the paint group when selection ends
        if (activePaintGroups.has(controller)) {
          endPaintGroup(controller);
        }
        painter.moveTo(cursor);
      }
    }
    
    // Right controller - other tools
    if (controller === controller2 && currentTool === 1 && isPlacingMeasurement) {
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
  if (buttonCooldown > 0) {
    buttonCooldown -= 0.016; // Approximately 60 FPS
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
  
  // Handle model selection with left thumbstick
  handleModelSelection();
  
  // Handle tool switching with right thumbstick
  handleToolSwitching();

  renderer.render(scene, camera);
}

// =====================================
// WEBXR SESSION MANAGEMENT
// =====================================

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
