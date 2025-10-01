# Deployment Guide

This project supports both local development and GitHub Pages deployment with different build scripts.

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

## Workflow

1. **Development**: Use `npm run dev` for development
2. **Local Testing**: Use `npm run build:local` to test production build locally
3. **GitHub Pages Deploy**: Use `npm run build:gh-pages` then commit and push the `dist` folder

The key difference is the `--public-url` flag that Parcel uses to set the base path for assets.