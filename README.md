# WebXR Design Studio

A comprehensive WebXR application that lets you paint, measure, and create 3D designs in augmented reality using Meta Quest 3 with passthrough mode.

## Features

- **3D Painting Tool**: Draw 3D brush strokes in space with tube-like geometry
- **Measurement Tool**: Create precise measurements between points with visual distance indicators
- **Eraser Tool**: Remove painted strokes, measurement lines, and placed models
- **Model Placement**: Place and manipulate pre-loaded 3D models (closet model included)
- **Dual Controller Support**: Left controller for model placement, right controller for tools
- **Tool Switching**: Easy tool switching with thumbstick controls
- **Model Manipulation**: Grab and move models with single or dual controller input
- **Design Persistence**: Save and load your designs with browser storage
- **Professional UI**: Clean interface with design management and notifications

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

2. **Start Creating**:
   - Click "Start New Design" to enter AR mode
   - Allow camera permissions when prompted
   - Use your controllers to paint, measure, and place models in 3D space

#### Option 2: Host Locally

1. **Install Dependencies and Start Development Server**:
   ```bash
   npm install
   npm run dev
   ```
   The application will be served on `http://localhost:1234` by default.

2. **For Mobile/Quest Access**:
   To access from mobile devices or Quest on the same network:
   ```bash
   # Get your local IP address
   ipconfig  # Windows
   ifconfig  # Mac/Linux
   
   # Access using your local IP
   # Example: http://192.168.1.100:1234
   ```

3. **For HTTPS (Recommended for WebXR)**:
   WebXR APIs require HTTPS. For local development, you can use:
   ```bash
   # Using ngrok for HTTPS tunnel
   npx ngrok http 1234
   
   # Or serve with HTTPS certificate
   # (requires certificate setup)
   ```

2. **Access on Quest 3**: 
   - Open the Meta Quest Browser
   - Navigate to your hosted URL (e.g., `https://your-url.ngrok.io` or your local IP with port)

3. **Start Creating**:
   - Click "Start New Design" and begin creating in AR

## How It Works

### Tool System

**Left Controller (Green)**:
- **Primary Function**: Model placement and manipulation
- **Thumbstick**: Switch between available models
- **Trigger**: Place models at green ring indicator location
- **Squeeze**: Grab and move placed models

**Right Controller (Tool-specific color)**:
- **Thumbstick**: Switch between tools (Painter/Measurement/Eraser)
- **Trigger**: Use current tool (paint, measure, erase)
- **Squeeze**: Grab models for dual-controller manipulation

### Tools Explained

#### Painter Tool (Blue)
- **Function**: Draw 3D brush strokes in space
- **Usage**: Hold trigger and move controller to paint
- **Features**: Creates tube-like 3D geometry that persists in space
- **Color**: Royal blue strokes

#### Measurement Tool (Red with Gold Tip)
- **Function**: Create precise distance measurements
- **Usage**: 
  - First trigger: Set start point
  - Move to end position (preview shows live measurement)
  - Second trigger: Finalize measurement
- **Features**: 
  - Snapping to existing measurement points
  - Visual distance labels
  - Persistent measurement lines

#### Eraser Tool (Pink)
- **Function**: Remove painted strokes, measurements, and models
- **Usage**: Point at object and trigger to remove
- **Range**: 10cm for models/measurements, 8cm for paint strokes
- **Priority**: Objects containing the eraser point are removed first

### Model System

- **Pre-loaded Models**: Closet model included by default
- **Preview**: 3cm scale preview on left controller
- **Placement**: Green ring indicator shows placement location
- **Manipulation**: Single or dual controller grabbing for movement and rotation
- **Scaling**: Models placed at full scale (1 OBJ unit = 1 meter)

## File Structure

```
xrloader/
├── index.html    # Main HTML file with design management UI
├── index.js      # WebXR application with painting, measurement, and model tools
├── style.css     # Application styles and snackbar notifications
├── package.json  # Dependencies and build scripts
├── assets/       # 3D model assets (closet.obj)
└── README.md     # Documentation
```

## Browser Compatibility

- **Supported**: Meta Quest Browser (Quest 3)
- **Supported**: Meta Quest Browser (Quest 2 with passthrough)
- **Limited**: Other WebXR-compatible browsers (features may vary)

## Troubleshooting

### "AR not supported on this device"
- Ensure you're using a WebXR-compatible browser (Meta Quest Browser recommended)
- Check device compatibility messages in the app
- Try accessing from Chrome on an AR-capable mobile device

### Tool not working
- Check that you're using the correct controller (left for models, right for tools)
- Switch tools using right controller thumbstick
- Look for tool indicator above right controller

### Can't paint or measure
- Ensure you're holding the trigger while painting
- For measurements, trigger once to start, move, then trigger again to finish
- Check that you're not in model placement mode

### Models not placing
- Look for the green ring indicator on surfaces
- Ensure adequate lighting for surface detection
- Try pointing at textured surfaces rather than plain walls

### Designs not saving
- Designs auto-save to browser storage
- Check browser permissions for local storage
- Use the design management interface to view saved designs

## Development

### Local Testing

For local development on Quest 3:
1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. Enable Developer Mode on your Quest 3 (if needed)
4. Use HTTPS (required for WebXR) - consider using ngrok for tunneling
5. Connect via local network using your machine's IP address and port 1234

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
- Additional 3D models in the assets folder
- New painting tools and brush types
- Advanced measurement features (angles, areas)
- Material/texture support for models
- Collaborative design features
- Export/import of designs
- Voice commands for tool switching

## License

MIT

## Credits

Built with:
- [Three.js](https://threejs.org/)
- [WebXR Device API](https://www.w3.org/TR/webxr/)