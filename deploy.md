# Deployment Guide

This project supports both local development and GitHub Pages deployment with different build scripts.

## Project Structure

- `assets/` - Static assets like .obj files that need to be included in builds
- `dist/` - Build output directory (generated)
- `index.js` - Main application code
- `index.html` - HTML entry point
- `style.css` - Styles

## Local Development

For local development, use:

```bash
npm run dev         # Start development server
npm run build:local # Build for local serving
```

The local build creates files with relative paths that work when served from any local server.

## GitHub Pages Deployment

For GitHub Pages deployment, use:

```bash
npm run build:gh-pages
```

This build includes the `/xrloader/` public URL prefix needed for GitHub Pages.

## Scripts Explanation

- `npm run dev` or `npm start` - Development server with hot reload
- `npm run build:local` - Production build for local serving (relative paths)
- `npm run build:gh-pages` - Production build for GitHub Pages (with /xrloader/ prefix)
- `npm run clean` - Remove dist and cache folders

## Asset Management

Static assets like `.obj` files are stored in the `assets/` directory and imported in the JavaScript code:

```javascript
import closetObjUrl from "./assets/closet.obj";
```

This ensures Parcel includes them in the build with proper hashing and path resolution.

## Workflow

1. **Development**: Use `npm run dev` for development
2. **Local Testing**: Use `npm run build:local` to test production build locally
3. **GitHub Pages Deploy**: Use `npm run build:gh-pages` then commit and push the `dist` folder

The key difference is the `--public-url` flag that Parcel uses to set the base path for assets.