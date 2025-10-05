# XR Loader

A WebXR application that allows you to load .obj 3D models and place them in your physical space using augmented reality with passthrough on Meta Quest 3.

## Features

-  **WebXR AR Support**: Built for Meta Quest 3 with passthrough mode
-  **Anchor System**: Models are anchored to real-world positions for stable placement
-  **OBJ Model Loading**: Load any .obj 3D model file
-  **Automatic Scaling**: Models are automatically scaled to appropriate size
-  **Multiple Placements**: Place the same model multiple times in your space
-  **Smart Lighting**: Automatic lighting setup for better model visibility

## Usage

### Prerequisites

- Meta Quest 3 (or any WebXR compatible AR headset)
- A web browser with WebXR support (Meta Quest Browser recommended)

### Quick Start

#### Option 1: Use GitHub Pages (Recommended)

Access the app directly at: **https://sambaas.github.io/xrloader/**

1. **Access on Quest 3**: 
   - Open the Meta Quest Browser
   - Navigate to `https://sambaas.github.io/xrloader/`

2. **Load and Place Models**:
   - Tap "Choose File" and select an .obj model from your device
   - Wait for the model to load
   - Tap "Start AR Session"
   - Look at your floor or any surface
   - When you see the green ring indicator, tap to place the model
   - The model will be anchored to that position

#### Option 2: Host Locally

1. **Host the Application**: Serve the files over HTTPS (required for WebXR)
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Node.js http-server
   npx http-server -p 8000
   ```
   
   Note: For local testing, you can use `ngrok` or similar tools to create an HTTPS tunnel:
   ```bash
   ngrok http 8000
   ```

2. **Access on Quest 3**: 
   - Open the Meta Quest Browser
   - Navigate to your hosted URL (e.g., `https://your-url.ngrok.io`)

3. **Load and Place Models**:
   - Same steps as Option 1

## How It Works

### Core Technologies

- **Three.js**: 3D graphics rendering
- **WebXR Device API**: AR session management
- **Hit Testing**: Surface detection for model placement
- **Anchors API**: Stable world-locked positioning

### Application Flow

1. **Model Loading**: OBJ files are parsed and prepared with automatic scaling
2. **AR Session**: Immersive AR session with hit-test and anchors features
3. **Surface Detection**: Real-time hit testing to detect surfaces in your environment
4. **Anchor Placement**: When you tap, an anchor is created at the detected surface
5. **Model Rendering**: Models are rendered at anchor positions with proper lighting

### Key Features Explained

#### Passthrough Mode
The app requests an `immersive-ar` session which automatically enables passthrough on Meta Quest 3, allowing you to see your real environment with virtual objects overlaid.

#### Anchor System
Anchors provide stable, world-locked positions for your models. This means:
- Models stay in place even if you move around
- Models maintain their position across tracking interruptions
- More accurate placement compared to non-anchored objects

#### Hit Testing
The green ring indicator shows where the model will be placed. It uses WebXR hit testing to:
- Detect surfaces in your environment
- Show real-time placement preview
- Ensure models are placed on valid surfaces

## File Structure

```
xrloader/
├── index.html    # Main HTML file with UI
├── app.js        # WebXR application logic
└── README.md     # Documentation
```

## Browser Compatibility

- ✅ Meta Quest Browser (Quest 3)
- ✅ Meta Quest Browser (Quest 2 with passthrough)
- ⚠️ Other WebXR-compatible browsers (features may vary)

## Troubleshooting

### "AR not supported on this device"
- Ensure you're using a WebXR-compatible browser (Meta Quest Browser recommended)
- Check that your device supports WebXR AR

### Model not loading
- Ensure the .obj file is valid
- Check browser console for error messages
- Try a different .obj file

### Can't place models
- Ensure you have adequate lighting
- Look at surfaces with texture (plain walls may not work well)
- Move your head slowly to help the device track your environment

### Anchor creation fails
- The app will fallback to placing models without anchors
- Anchors require good tracking - ensure adequate lighting and textured surfaces

## Development

### Local Testing

For local development on Quest 3:
1. Enable Developer Mode on your Quest 3
2. Use HTTPS (required for WebXR)
3. Connect via local network or use ngrok/similar tunneling service

### Deploying to GitHub Pages

This application is deployed using GitHub Pages for easy access:

1. **Enable GitHub Pages** in your repository settings:
   - Go to repository Settings → Pages
   - Set Source to "Deploy from a branch"
   - Select branch: `main` (or your default branch)
   - Select folder: `/ (root)`
   - Click Save

2. **Access your deployment**:
   - The app will be available at: `https://[username].github.io/[repository-name]/`
   - For this repo: `https://sambaas.github.io/xrloader/`

3. **HTTPS requirement**: GitHub Pages automatically provides HTTPS, which is required for WebXR APIs.

### Extending the Application

The code is modular and can be extended with:
- Material/texture loading (.mtl files)
- Multiple model format support (GLTF, FBX)
- Model rotation and scaling controls
- Save/load placement configurations
- Occlusion and lighting estimation

## License

MIT

## Credits

Built with:
- [Three.js](https://threejs.org/)
- [WebXR Device API](https://www.w3.org/TR/webxr/)