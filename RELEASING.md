# Publishing a release

1. Update the userscript `@version`, `package.json` and `CHANGELOG.md` together.
2. Run the unit, browser and placement tests. Run the helper checks with calibre installed.
3. Commit the reviewed changes and create a matching version tag (for example `v0.5.2`).
4. Run `tools/build-release.ps1` from the project root.
5. Create a GitHub release for the tag and attach the files in `dist`: the userscript, metadata header and Windows ZIP package.
6. Check the published installation and download links before announcing the release.

The userscript update URLs should point to the latest published release assets, so development commits do not immediately become user updates. Keep `@name` and `@namespace` unchanged to preserve existing installations. The Windows helper is updated by downloading and extracting a new package; it does not update itself.

Do not include personal book exports, generated test output, local configuration or historical development logs in release assets.
