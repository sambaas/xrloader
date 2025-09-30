import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/loaders/OBJLoader.js';

class XRApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.statusDiv = document.getElementById('status');
        this.startXRButton = document.getElementById('startXR');
        this.objFileInput = document.getElementById('objFile');
        
        this.loadedModel = null;
        this.placedModels = [];
        this.anchors = [];
        this.reticle = null;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        
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
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.reticle = new THREE.Mesh(geometry, material);
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    setupEventListeners() {
        // File input listener
        this.objFileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Start XR button listener
        this.startXRButton.addEventListener('click', () => this.startXRSession());
        
        // Window resize listener
        window.addEventListener('resize', () => this.onWindowResize());
    }

    async checkXRSupport() {
        if ('xr' in navigator) {
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar');
                if (supported) {
                    this.updateStatus('AR supported! Load a model to begin.');
                } else {
                    this.updateStatus('AR not supported on this device.');
                    this.startXRButton.disabled = true;
                }
            } catch (error) {
                console.error('Error checking XR support:', error);
                this.updateStatus('Error checking AR support.');
            }
        } else {
            this.updateStatus('WebXR not available in this browser.');
            this.startXRButton.disabled = true;
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        this.updateStatus('Loading model...');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.loadOBJModel(e.target.result);
        };
        reader.readAsText(file);
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
            this.startXRButton.disabled = false;
            this.updateStatus('Model loaded! Click "Start AR Session" to place it.');
            
        } catch (error) {
            console.error('Error loading OBJ model:', error);
            this.updateStatus('Error loading model. Please check the file.');
        }
    }

    async startXRSession() {
        if (!this.loadedModel) {
            this.updateStatus('Please load a model first!');
            return;
        }
        
        try {
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test', 'anchors'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.getElementById('ui') }
            });
            
            this.xrSession = session;
            await this.renderer.xr.setSession(session);
            
            session.addEventListener('end', () => this.onSessionEnd());
            session.addEventListener('select', (event) => this.onSelect(event));
            
            this.updateStatus('AR Session started! Tap to place the model.');
            
        } catch (error) {
            console.error('Error starting XR session:', error);
            this.updateStatus('Failed to start AR session: ' + error.message);
        }
    }

    onSessionEnd() {
        this.xrSession = null;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        this.reticle.visible = false;
        this.updateStatus('AR Session ended.');
    }

    async onSelect(event) {
        if (!this.loadedModel || !this.reticle.visible) return;
        
        const frame = event.frame;
        const session = frame.session;
        
        // Clone the loaded model
        const modelClone = this.loadedModel.clone();
        modelClone.position.setFromMatrixPosition(this.reticle.matrix);
        
        // Try to create an anchor
        if (this.reticle.visible && frame.session.createAnchor) {
            try {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const anchorPose = hit.getPose(frame.session.referenceSpace);
                    
                    // Create anchor at the hit location
                    const anchor = await frame.session.createAnchor(
                        anchorPose.transform,
                        frame.session.referenceSpace
                    );
                    
                    if (anchor) {
                        this.anchors.push({
                            anchor: anchor,
                            model: modelClone
                        });
                        
                        this.scene.add(modelClone);
                        this.placedModels.push(modelClone);
                        
                        this.updateStatus(`Model placed with anchor! (${this.placedModels.length} total)`);
                        console.log('Model placed with anchor successfully');
                    }
                }
            } catch (error) {
                console.warn('Anchor creation failed, placing without anchor:', error);
                // Fallback: place without anchor
                this.scene.add(modelClone);
                this.placedModels.push(modelClone);
                this.updateStatus(`Model placed! (${this.placedModels.length} total)`);
            }
        } else {
            // Fallback: place without anchor
            this.scene.add(modelClone);
            this.placedModels.push(modelClone);
            this.updateStatus(`Model placed! (${this.placedModels.length} total)`);
        }
    }

    render(timestamp, frame) {
        if (frame) {
            const session = frame.session;
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            
            // Request hit test source if not already done
            if (!this.hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then((viewerSpace) => {
                    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
                        this.hitTestSource = source;
                    });
                });
                this.hitTestSourceRequested = true;
            }
            
            // Perform hit test
            if (this.hitTestSource) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);
                
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    const pose = hit.getPose(referenceSpace);
                    
                    this.reticle.visible = true;
                    this.reticle.matrix.fromArray(pose.transform.matrix);
                } else {
                    this.reticle.visible = false;
                }
            }
            
            // Update anchored models
            this.anchors.forEach(({ anchor, model }) => {
                if (anchor && model) {
                    const anchorPose = frame.getPose(anchor.anchorSpace, referenceSpace);
                    if (anchorPose) {
                        model.matrix.fromArray(anchorPose.transform.matrix);
                        model.matrixAutoUpdate = false;
                    }
                }
            });
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
