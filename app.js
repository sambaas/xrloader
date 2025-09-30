import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

class XRApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.statusDiv = document.getElementById('status');
        this.startXRButton = document.getElementById('startXR');
        this.loadModelButton = document.getElementById('loadModel');
        this.objFileInput = document.getElementById('objFile');
        this.objUrlInput = document.getElementById('objUrl');
        this.loadFromFileRadio = document.getElementById('loadFromFile');
        this.loadFromUrlRadio = document.getElementById('loadFromUrl');
        
        this.loadedModel = null;
        this.placedModels = [];
        this.reticle = null;
        this.isXRSupported = false;
        
        // XR globals (following working example pattern)
        this.xrSession = null;
        this.xrRefSpace = null;
        this.xrViewerSpace = null;
        this.xrHitTestSource = null;
        
        // Controller and interaction state
        this.controllers = [];
        this.controllerGrips = [];
        this.selectedModel = null;
        this.isGrabbing = false;
        this.grabOffset = new THREE.Vector3();
        
        this.init();
    }

    init() {
        // Setup Three.js scene
        this.scene = new THREE.Scene();
        
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.01,
            20
        );
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        
        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
        directionalLight.position.set(0, 5, 5);
        this.scene.add(directionalLight);
        
        // Create reticle (placement indicator)
        this.createReticle();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check XR support
        this.checkXRSupport();
        
        // Start render loop
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    createReticle() {
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.reticle = new THREE.Mesh(geometry, material);
        this.reticle.matrixAutoUpdate = true; // Allow automatic matrix updates for fallback positioning
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    setupEventListeners() {
        // Load model button listener
        this.loadModelButton.addEventListener('click', () => this.handleLoadModel());
        
        // Radio button listeners
        this.loadFromFileRadio.addEventListener('change', () => this.toggleLoadMethod());
        this.loadFromUrlRadio.addEventListener('change', () => this.toggleLoadMethod());
        
        // Start XR button listener
        this.startXRButton.addEventListener('click', () => this.startXRSession());
        
        // Window resize listener
        window.addEventListener('resize', () => this.onWindowResize());
    }

    async checkXRSupport() {
        if ('xr' in navigator) {
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar');
                this.isXRSupported = supported;
                if (supported) {
                    this.updateStartButtonState();
                } else {
                    this.updateStatus('AR not supported on this device.');
                    this.startXRButton.disabled = true;
                    this.startXRButton.textContent = 'AR Not Supported';
                }
            } catch (error) {
                console.error('Error checking XR support:', error);
                this.updateStatus('Error checking AR support.');
                this.startXRButton.disabled = true;
                this.startXRButton.textContent = 'AR Error';
            }
        } else {
            this.updateStatus('WebXR not available in this browser.');
            this.startXRButton.disabled = true;
            this.startXRButton.textContent = 'WebXR Not Available';
        }
    }

    toggleLoadMethod() {
        if (this.loadFromFileRadio.checked) {
            this.objFileInput.style.display = 'block';
            this.objUrlInput.style.display = 'none';
        } else {
            this.objFileInput.style.display = 'none';
            this.objUrlInput.style.display = 'block';
        }
    }

    updateStartButtonState() {
        if (!this.isXRSupported) {
            this.startXRButton.disabled = true;
            this.startXRButton.textContent = 'AR Not Supported';
        } else if (!this.loadedModel) {
            this.startXRButton.disabled = true;
            this.startXRButton.textContent = 'Load Model First';
        } else {
            this.startXRButton.disabled = false;
            this.startXRButton.textContent = 'Start AR Session';
        }
    }

    handleLoadModel() {
        if (this.loadFromFileRadio.checked) {
            const file = this.objFileInput.files[0];
            if (!file) {
                this.updateStatus('Please select a file first!');
                return;
            }
            this.handleFileSelect(file);
        } else {
            const url = this.objUrlInput.value.trim();
            if (!url) {
                this.updateStatus('Please enter a URL first!');
                return;
            }
            this.handleUrlLoad(url);
        }
    }

    handleFileSelect(file) {
        this.updateStatus('Loading model from file...');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.loadOBJModel(e.target.result);
        };
        reader.onerror = () => {
            this.updateStatus('Error reading file.');
        };
        reader.readAsText(file);
    }

    async handleUrlLoad(url) {
        this.updateStatus('Loading model from URL...');
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const objData = await response.text();
            this.loadOBJModel(objData);
            
        } catch (error) {
            console.error('Error loading OBJ from URL:', error);
            let errorMessage = 'Error loading model from URL: ';
            
            if (error.name === 'TypeError') {
                errorMessage += 'Network error or CORS issue. Make sure the URL is accessible.';
            } else {
                errorMessage += error.message;
            }
            
            this.updateStatus(errorMessage);
        }
    }

    loadOBJModel(objData) {
        const loader = new OBJLoader();
        
        try {
            const object = loader.parse(objData);
            
            // Calculate bounding box and scale model appropriately
            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 0.5 / maxDim; // Scale to 0.5 meter max dimension
            
            object.scale.set(scale, scale, scale);
            
            // Center the model
            const center = box.getCenter(new THREE.Vector3());
            object.position.sub(center.multiplyScalar(scale));
            
            // Add basic material if objects don't have materials
            object.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    if (!child.material || child.material.length === 0) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x888888,
                            roughness: 0.7,
                            metalness: 0.3
                        });
                    }
                }
            });
            
            this.loadedModel = object;
            this.updateStartButtonState();
            this.updateStatus('Model loaded successfully! You can now start the AR session.');
            
        } catch (error) {
            console.error('Error loading OBJ model:', error);
            this.updateStatus('Error loading model. Please check the file format.');
        }
    }

    async startXRSession() {
        if (!this.loadedModel) {
            this.updateStatus('Please load a model first!');
            return;
        }
        
        if (!this.isXRSupported) {
            this.updateStatus('AR is not supported on this device!');
            return;
        }
        
        try {
            this.updateStatus('Starting AR session...');
            
            // Use the working pattern from the WebXR samples
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local', 'hit-test']
            });
            
            this.xrSession = session;
            await this.renderer.xr.setSession(session);
            
            session.addEventListener('end', () => this.onSessionEnd());
            session.addEventListener('select', (event) => this.onSelect(event));
            
            // Setup hit testing (following the working example)
            this.setupHitTesting(session);
            
            // Setup controllers
            this.setupControllers();
            
            this.updateStatus('AR Session started! Point at surfaces and tap to place models.');
            
        } catch (error) {
            console.error('Error starting XR session:', error);
            this.updateStatus('Failed to start AR session: ' + error.message);
        }
    }

    async setupHitTesting(session) {
        // Get viewer space for hit testing
        try {
            this.xrViewerSpace = await session.requestReferenceSpace('viewer');
            this.xrHitTestSource = await session.requestHitTestSource({ space: this.xrViewerSpace });
            console.log('Hit test source created successfully');
        } catch (error) {
            console.warn('Hit test setup failed:', error);
        }

        // Get local reference space for rendering
        try {
            this.xrRefSpace = await session.requestReferenceSpace('local');
            console.log('Local reference space acquired');
        } catch (error) {
            console.warn('Local reference space failed:', error);
        }
    }

    onSessionEnd() {
        if (this.xrHitTestSource) {
            this.xrHitTestSource.cancel();
            this.xrHitTestSource = null;
        }
        
        this.xrSession = null;
        this.xrRefSpace = null;
        this.xrViewerSpace = null;
        this.reticle.visible = false;
        this.selectedModel = null;
        this.isGrabbing = false;
        
        // Clean up controllers
        this.controllers.forEach(controller => {
            if (controller.parent) {
                controller.parent.remove(controller);
            }
        });
        this.controllerGrips.forEach(grip => {
            if (grip.parent) {
                grip.parent.remove(grip);
            }
        });
        this.controllers = [];
        this.controllerGrips = [];
        
        this.updateStatus('AR Session ended.');
    }

    setupControllers() {
        // Setup controller 0 (right hand)
        const controller1 = this.renderer.xr.getController(0);
        controller1.addEventListener('connected', (event) => {
            console.log('Controller 0 connected:', event.data);
        });
        controller1.addEventListener('selectstart', () => this.onButtonPress(0, 'trigger'));
        controller1.addEventListener('selectend', () => this.onButtonRelease(0, 'trigger'));
        this.scene.add(controller1);
        this.controllers.push(controller1);

        // Setup controller 1 (left hand)
        const controller2 = this.renderer.xr.getController(1);
        controller2.addEventListener('connected', (event) => {
            console.log('Controller 1 connected:', event.data);
        });
        controller2.addEventListener('selectstart', () => this.onButtonPress(1, 'trigger'));
        controller2.addEventListener('selectend', () => this.onButtonRelease(1, 'trigger'));
        this.scene.add(controller2);
        this.controllers.push(controller2);

        // Setup controller grips
        const controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.scene.add(controllerGrip1);
        this.controllerGrips.push(controllerGrip1);

        const controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        this.scene.add(controllerGrip2);
        this.controllerGrips.push(controllerGrip2);

        // Add visual indicators for controllers
        this.addControllerVisuals();
    }

    addControllerVisuals() {
        // Add simple line pointers for controllers
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });

        this.controllers.forEach(controller => {
            const line = new THREE.Line(geometry, material);
            controller.add(line);
        });
    }

    findClosestModel(position, maxDistance = 1.0) {
        let closestModel = null;
        let closestDistance = maxDistance;

        this.placedModels.forEach(model => {
            const distance = position.distanceTo(model.position);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestModel = model;
            }
        });

        return closestModel;
    }

    onButtonPress(controllerIndex, button) {
        console.log(`Controller ${controllerIndex} ${button} pressed`);
        
        // Handle snap-to-front on trigger press when not grabbing
        if (button === 'trigger' && !this.isGrabbing) {
            this.snapSelectedModelToFront();
        }
    }

    onButtonRelease(controllerIndex, button) {
        console.log(`Controller ${controllerIndex} ${button} released`);
    }

    snapSelectedModelToFront() {
        // If no model is selected, try to find the closest one
        if (!this.selectedModel && this.placedModels.length > 0) {
            // Get head position (camera position)
            const headPosition = new THREE.Vector3();
            this.camera.getWorldPosition(headPosition);
            
            this.selectedModel = this.findClosestModel(headPosition, 10.0) || this.placedModels[0];
        }

        if (this.selectedModel) {
            // Get camera position and direction
            const cameraPosition = new THREE.Vector3();
            const cameraDirection = new THREE.Vector3();
            
            this.camera.getWorldPosition(cameraPosition);
            this.camera.getWorldDirection(cameraDirection);
            
            // Place model 1.5 meters in front of camera
            const targetPosition = cameraPosition.clone().add(cameraDirection.multiplyScalar(1.5));
            
            // Animate movement to front
            this.animateModelToPosition(this.selectedModel, targetPosition);
            
            this.updateStatus('Model snapped to front! Squeeze to grab and move it.');
        } else {
            this.updateStatus('No model to snap. Place a model first!');
        }
    }

    animateModelToPosition(model, targetPosition) {
        const startPosition = model.position.clone();
        const startTime = performance.now();
        const duration = 500; // 500ms animation

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            model.position.lerpVectors(startPosition, targetPosition, easeProgress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    async onSelect(event) {
        if (!this.loadedModel) return;
        
        // Only place if reticle is visible (hit test successful)
        if (this.reticle.visible) {
            // Clone the loaded model
            const modelClone = this.loadedModel.clone();
            
            // Use reticle's matrix (which contains hit test result)
            modelClone.matrix.fromArray(this.reticle.matrix.elements);
            modelClone.matrix.decompose(modelClone.position, modelClone.quaternion, modelClone.scale);
            
            // Add to scene
            this.scene.add(modelClone);
            this.placedModels.push(modelClone);
            
            this.updateStatus(`Model placed! (${this.placedModels.length} total) - Squeeze controllers to grab and move.`);
        } else {
            this.updateStatus('Point at a surface first!');
        }
    }

    render(timestamp, frame) {
        if (frame) {
            const session = frame.session;
            
            // Handle hit testing (following working example pattern)
            if (this.xrRefSpace) {
                const pose = frame.getViewerPose(this.xrRefSpace);
                
                // Hide reticle by default
                this.reticle.visible = false;
                
                // If we have hit test source and viewer pose, do hit testing
                if (this.xrHitTestSource && pose) {
                    const hitTestResults = frame.getHitTestResults(this.xrHitTestSource);
                    if (hitTestResults.length > 0) {
                        const hitPose = hitTestResults[0].getPose(this.xrRefSpace);
                        if (hitPose) {
                            this.reticle.visible = true;
                            this.reticle.matrix.fromArray(hitPose.transform.matrix);
                        }
                    }
                }
            }
            
            // Handle controller input for grabbing models
            if (session.inputSources) {
                for (let i = 0; i < session.inputSources.length; i++) {
                    const inputSource = session.inputSources[i];
                    
                    if (inputSource.gamepad) {
                        // Check for Y button to snap model to front
                        if (inputSource.gamepad.buttons[3] && inputSource.gamepad.buttons[3].pressed) {
                            this.snapSelectedModelToFront();
                        }
                        
                        // Handle squeeze for grabbing
                        if (inputSource.gamepad.buttons[1] && inputSource.gamepad.buttons[1].pressed) {
                            if (!this.isGrabbing) {
                                // Start grabbing
                                const controller = this.controllers[i];
                                if (controller) {
                                    const controllerPosition = new THREE.Vector3();
                                    controller.getWorldPosition(controllerPosition);
                                    
                                    const closestModel = this.findClosestModel(controllerPosition, 0.5);
                                    if (closestModel) {
                                        this.selectedModel = closestModel;
                                        this.isGrabbing = true;
                                        this.grabOffset.copy(closestModel.position).sub(controllerPosition);
                                        this.selectedModel.scale.multiplyScalar(1.1);
                                        this.updateStatus('Grabbed model! Move controller to reposition.');
                                    }
                                }
                            } else if (this.selectedModel) {
                                // Continue moving while squeezing
                                const controller = this.controllers[i];
                                if (controller) {
                                    const controllerPosition = new THREE.Vector3();
                                    controller.getWorldPosition(controllerPosition);
                                    this.selectedModel.position.copy(controllerPosition).add(this.grabOffset);
                                    
                                    // Apply controller rotation
                                    const controllerQuaternion = new THREE.Quaternion();
                                    controller.getWorldQuaternion(controllerQuaternion);
                                    this.selectedModel.quaternion.copy(controllerQuaternion);
                                }
                            }
                        } else if (this.isGrabbing) {
                            // Release grab when squeeze button is released
                            if (this.selectedModel) {
                                this.selectedModel.scale.divideScalar(1.1);
                                this.updateStatus('Model released. Tap trigger to place new models.');
                            }
                            this.isGrabbing = false;
                            this.selectedModel = null;
                        }
                    }
                }
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateStatus(message) {
        this.statusDiv.textContent = message;
        console.log('Status:', message);
    }
}

// Initialize the app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new XRApp();
});
