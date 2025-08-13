import Template from "./Template";
import { base64ToUint8, numberToEncoded } from "./utils";

/** Manages the template system.
 * This class handles all external requests for template modification, creation, and analysis.
 * It serves as the central coordinator between template instances and the user interface.
 * @class TemplateManager
 * @since 0.55.8
 * @example
 * // JSON structure for a template
 * {
 *   "whoami": "BlueMarble",
 *   "scriptVersion": "1.13.0",
 *   "schemaVersion": "2.1.0",
 *   "templates": {
 *     "0 $Z": {
 *       "name": "My Template",
 *       "enabled": true,
 *       "tiles": {
 *         "1231,0047,183,593": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
 *         "1231,0048,183,000": "data:image/png;AAAFCAYAAACNbyblAAAAHElEQVQI12P4"
 *       }
 *     },
 *     "1 $Z": {
 *       "name": "My Template",
 *       "URL": "https://github.com/SwingTheVine/Wplace-BlueMarble/blob/main/dist/assets/Favicon.png",
 *       "URLType": "template",
 *       "enabled": false,
 *       "tiles": {
 *         "375,1846,276,188": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
 *         "376,1846,000,188": "data:image/png;AAAFCAYAAACNbyblAAAAHElEQVQI12P4"
 *       }
 *     }
 *   }
 * }
 */
export default class TemplateManager {

  /** The constructor for the {@link TemplateManager} class.
   * @since 0.55.8
   */
  constructor(name, version, overlay) {

    // Meta
    this.name = name; // Name of userscript
    this.version = version; // Version of userscript
    this.overlay = overlay; // The main instance of the Overlay class
    this.templatesVersion = '1.0.0'; // Version of JSON schema
    this.userID = null; // The ID of the current user
    this.encodingBase = '!#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~'; // Characters to use for encoding/decoding
    this.tileSize = 1000; // The number of pixels in a tile. Assumes the tile is square
    this.drawMult = 3; // The enlarged size for each pixel. E.g. when "3", a 1x1 pixel becomes a 1x1 pixel inside a 3x3 area. MUST BE ODD
    this.autoCoords = false; // Whether to automatically fill coordinates when clicking the map
    
    // Template
    this.canvasTemplate = null; // Our canvas
    this.canvasTemplateZoomed = null; // The template when zoomed out
    this.canvasTemplateID = 'bm-canvas'; // Our canvas ID
    this.canvasMainID = 'div#map canvas.maplibregl-canvas'; // The selector for the main canvas
    this.template = null; // The template image.
    this.templateState = ''; // The state of the template ('blob', 'proccessing', 'template', etc.)
    this.templatesArray = []; // All Template instnaces currently loaded (Template)
    this.templatesJSON = null; // All templates currently loaded (JSON)
    this.templatesShouldBeDrawn = true; // Should ALL templates be drawn to the canvas?
  }

  /** Retrieves the pixel art canvas.
   * If the canvas has been updated/replaced, it retrieves the new one.
   * @param {string} selector - The CSS selector to use to find the canvas.
   * @returns {HTMLCanvasElement|null} The canvas as an HTML Canvas Element, or null if the canvas does not exist
   * @since 0.58.3
   * @deprecated Not in use since 0.63.25
   */
  /* @__PURE__ */getCanvas() {

    // If the stored canvas is "fresh", return the stored canvas
    if (document.body.contains(this.canvasTemplate)) {return this.canvasTemplate;}
    // Else, the stored canvas is "stale", get the canvas again

    // Attempt to find and destroy the "stale" canvas
    document.getElementById(this.canvasTemplateID)?.remove(); 

    const canvasMain = document.querySelector(this.canvasMainID);

    const canvasTemplateNew = document.createElement('canvas');
    canvasTemplateNew.id = this.canvasTemplateID;
    canvasTemplateNew.className = 'maplibregl-canvas';
    canvasTemplateNew.style.position = 'absolute';
    canvasTemplateNew.style.top = '0';
    canvasTemplateNew.style.left = '0';
    canvasTemplateNew.style.height = `${canvasMain?.clientHeight * (window.devicePixelRatio || 1)}px`;
    canvasTemplateNew.style.width = `${canvasMain?.clientWidth * (window.devicePixelRatio || 1)}px`;
    canvasTemplateNew.height = canvasMain?.clientHeight * (window.devicePixelRatio || 1);
    canvasTemplateNew.width = canvasMain?.clientWidth * (window.devicePixelRatio || 1);
    canvasTemplateNew.style.zIndex = '8999';
    canvasTemplateNew.style.pointerEvents = 'none';
    canvasMain?.parentElement?.appendChild(canvasTemplateNew); // Append the newCanvas as a child of the parent of the main canvas
    this.canvasTemplate = canvasTemplateNew; // Store the new canvas

    window.addEventListener('move', this.onMove);
    window.addEventListener('zoom', this.onZoom);
    window.addEventListener('resize', this.onResize);

    return this.canvasTemplate; // Return the new canvas
  }

  /** Creates the JSON object to store templates in
   * @returns {{ whoami: string, scriptVersion: string, schemaVersion: string, templates: Object }} The JSON object
   * @since 0.65.4
   */
  async createJSON() {
    return {
      "whoami": this.name.replace(' ', ''), // Name of userscript without spaces
      "scriptVersion": this.version, // Version of userscript
      "schemaVersion": this.templatesVersion, // Version of JSON schema
      "templates": {} // The templates
    };
  }

  /** Creates the template from the inputed file blob
   * @param {File} blob - The file blob to create a template from
   * @param {string} name - The display name of the template
   * @param {Array<number, number, number, number>} coords - The coordinates of the top left corner of the template
   * @since 0.65.77
   */
  async createTemplate(blob, name, coords) {

    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON(); console.log(`Creating JSON...`);}

    this.overlay.handleDisplayStatus(`Creating template at ${coords.join(', ')}...`);

    // Creates a new template instance
    const template = new Template({
      displayName: name,
      sortID: Object.keys(this.templatesJSON.templates).length || 0,
      authorID: numberToEncoded(this.userID || 0, this.encodingBase),
      file: blob,
      coords: coords
    });
    //template.chunked = await template.createTemplateTiles(this.tileSize); // Chunks the tiles
    const { templateTiles, templateTilesBuffers } = await template.createTemplateTiles(this.tileSize); // Chunks the tiles
    template.chunked = templateTiles; // Stores the chunked tile bitmaps

    // Appends a child into the templates object
    // The child's name is the number of templates already in the list (sort order) plus the encoded player ID
    this.templatesJSON.templates[`${template.sortID} ${template.authorID}`] = {
      "name": template.displayName, // Display name of template
      "coords": coords.join(', '), // The coords of the template
      "enabled": true,
  "tiles": templateTilesBuffers, // Stores the chunked tile buffers
  // Persist the exact pixel count so future imports are accurate without recomputation
  "pixelCount": template.pixelCount
    };

    this.templatesArray.push(template); // Pushes the Template object instance to the Template Array

    // ==================== PIXEL COUNT DISPLAY SYSTEM ====================
    // Display pixel count statistics with internationalized number formatting
    // This provides immediate feedback to users about template complexity and size
    const pixelCountFormatted = new Intl.NumberFormat().format(template.pixelCount);
    this.overlay.handleDisplayStatus(`Template created at ${coords.join(', ')}! Total pixels: ${pixelCountFormatted}`);

    console.log(Object.keys(this.templatesJSON.templates).length);
    console.log(this.templatesJSON);
    console.log(this.templatesArray);
    console.log(JSON.stringify(this.templatesJSON));

    await this.#storeTemplates();
  }

  /** Generates a {@link Template} class instance from the JSON object template
   */
  #loadTemplate() {

  }

  /** Stores the JSON object of the loaded templates into TamperMonkey (GreaseMonkey) storage.
   * @since 0.72.7
   */
  async #storeTemplates() {
    // Persist to userscript storage (scoped to @name/@namespace)
    GM.setValue('bmTemplates', JSON.stringify(this.templatesJSON));
    // ALSO persist to localStorage under a stable key so a future @name change can migrate data
    try {
      localStorage.setItem('BlueMarbleTemplates', JSON.stringify(this.templatesJSON));
    } catch (e) {
      console.warn('[BlueMarble] Failed to write localStorage backup for templates:', e);
    }
  }

  /** Deletes a template from the JSON object.
   * Also delete's the corresponding {@link Template} class instance
   * @param {string} templateKey - The key of the template to delete (e.g. "0 $Z")
   * @since 0.80.0
   */
  async deleteTemplate(templateKey) {
    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON();}

    // Remove from JSON object
    if (this.templatesJSON.templates[templateKey]) {
      delete this.templatesJSON.templates[templateKey];
    }

    // Remove from array by finding the template with matching sort ID and author ID
    const [sortID, authorID] = templateKey.split(' ');
    this.templatesArray = this.templatesArray.filter(template => 
      !(template.sortID == Number(sortID) && template.authorID === authorID)
    );

    await this.#storeTemplates();
  }

  /** Enables or disables a specific template from view
   * @param {string} templateKey - The key of the template to toggle (e.g. "0 $Z")
   * @param {boolean} enabled - Whether the template should be enabled
   * @since 0.80.0
   */
  async toggleTemplate(templateKey, enabled) {
    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON();}

    // Update the enabled state in JSON
    if (this.templatesJSON.templates[templateKey]) {
      this.templatesJSON.templates[templateKey].enabled = enabled;
    }

    // Update the enabled state in the template array
    const [sortID, authorID] = templateKey.split(' ');
    const template = this.templatesArray.find(t => 
      t.sortID == Number(sortID) && t.authorID === authorID
    );
    if (template) {
      template.enabled = enabled;
    }

    await this.#storeTemplates();
  }

  /** Updates the coordinates of a specific template
   * @param {string} templateKey - The key of the template to update (e.g. "0 $Z")
   * @param {Array<number>} newCoords - New coordinates [tileX, tileY, pixelX, pixelY]
   * @since 0.81.1
   */
  async updateTemplateCoordinates(templateKey, newCoords) {
    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON();}

    // Validate coordinates
    if (!Array.isArray(newCoords) || newCoords.length !== 4) {
      throw new Error('Coordinates must be an array of 4 numbers [tileX, tileY, pixelX, pixelY]');
    }

    // Ensure all coordinates are numbers within valid ranges
    const [tileX, tileY, pixelX, pixelY] = newCoords.map(Number);
    if (![tileX, tileY, pixelX, pixelY].every(coord => !isNaN(coord) && isFinite(coord))) {
      throw new Error('All coordinates must be valid numbers');
    }

    // Update coordinates in JSON
    if (this.templatesJSON.templates[templateKey]) {
      this.templatesJSON.templates[templateKey].coords = newCoords.join(', ');
    }

    // Update coordinates in the template array
    const [sortID, authorID] = templateKey.split(' ');
    const template = this.templatesArray.find(t => 
      t.sortID == Number(sortID) && t.authorID === authorID
    );
    if (template) {
      template.coords = newCoords;
    }

    await this.#storeTemplates();
    
    // Return success message
    return `Template coordinates updated to: ${newCoords.join(', ')}`;
  }

  /** Gets all templates with their metadata
   * @returns {Array} Array of template objects with metadata
   * @since 0.80.0
   */
  getAllTemplates() {
    if (!this.templatesJSON || !this.templatesJSON.templates) {
      return [];
    }

    return Object.entries(this.templatesJSON.templates).map(([key, template]) => ({
      key: key,
      name: template.name,
      coords: template.coords,
      enabled: template.enabled,
  // Prefer runtime template instance pixelCount; fallback to persisted JSON pixelCount; else 0
  pixelCount: this.templatesArray.find(t => `${t.sortID} ${t.authorID}` === key)?.pixelCount || template.pixelCount || 0
    }));
  }

  /** Draws all templates on the specified tile.
   * This method handles the rendering of template overlays on individual tiles.
   * @param {File} tileBlob - The pixels that are placed on a tile
   * @param {Array<number>} tileCoords - The tile coordinates [x, y]
   * @since 0.65.77
   */
  async drawTemplateOnTile(tileBlob, tileCoords) {

    // Returns early if no templates should be drawn
    if (!this.templatesShouldBeDrawn) {return tileBlob;}

    const drawSize = this.tileSize * this.drawMult; // Calculate draw multiplier for scaling

    // Format tile coordinates with proper padding for consistent lookup
    tileCoords = tileCoords[0].toString().padStart(4, '0') + ',' + tileCoords[1].toString().padStart(4, '0');

    console.log(`Searching for templates in tile: "${tileCoords}"`);

    const templateArray = this.templatesArray; // Stores a copy for sorting
    console.log(templateArray);

    // Sorts the array of Template class instances. 0 = first = lowest draw priority
    templateArray.sort((a, b) => {return a.sortID - b.sortID;});

    console.log(templateArray);

    // Retrieves the relavent template tile blobs
    const templatesToDraw = templateArray
      .filter(template => template.enabled) // Only include enabled templates
      .map(template => {
        const matchingTiles = Object.keys(template.chunked).filter(tile =>
          tile.startsWith(tileCoords)
        );

        if (matchingTiles.length === 0) {return null;} // Return null when nothing is found

        // Retrieves the blobs of the templates for this tile
        const matchingTileBlobs = matchingTiles.map(tile => {

          const coords = tile.split(','); // [x, y, x, y] Tile/pixel coordinates
          
          return {
            bitmap: template.chunked[tile],
            tileCoords: [coords[0], coords[1]],
            pixelCoords: [coords[2], coords[3]]
          }
        });

        return matchingTileBlobs?.[0];
      })
    .filter(Boolean);

    console.log(templatesToDraw);

    const templateCount = templatesToDraw?.length || 0; // Number of templates to draw on this tile
    console.log(`templateCount = ${templateCount}`);

    if (templateCount > 0) {
      
      // Calculate total pixel count for templates actively being displayed in this tile
      const totalPixels = templateArray
        .filter(template => {
          // Filter templates to include only those with tiles matching current coordinates AND are enabled
          // This ensures we count pixels only for templates actually being rendered
          const matchingTiles = Object.keys(template.chunked).filter(tile =>
            tile.startsWith(tileCoords)
          );
          return matchingTiles.length > 0 && template.enabled;
        })
        .reduce((sum, template) => sum + (template.pixelCount || 0), 0);
      
      // Format pixel count with locale-appropriate thousands separators for better readability
      // Examples: "1,234,567" (US), "1.234.567" (DE), "1 234 567" (FR)
      const pixelCountFormatted = new Intl.NumberFormat().format(totalPixels);
      
      // Display status information about the templates being rendered
      this.overlay.handleDisplayStatus(
        `Displaying ${templateCount} template${templateCount == 1 ? '' : 's'}.\nTotal pixels: ${pixelCountFormatted}`
      );
    } else {
      this.overlay.handleDisplayStatus(`Displaying ${templateCount} templates.`);
    }
    
    const tileBitmap = await createImageBitmap(tileBlob);

    const canvas = new OffscreenCanvas(drawSize, drawSize);
    const context = canvas.getContext('2d');

    context.imageSmoothingEnabled = false; // Nearest neighbor

    // Tells the canvas to ignore anything outside of this area
    context.beginPath();
    context.rect(0, 0, drawSize, drawSize);
    context.clip();

    context.clearRect(0, 0, drawSize, drawSize); // Draws transparent background
    context.drawImage(tileBitmap, 0, 0, drawSize, drawSize);

    // For each template in this tile, draw them.
    for (const template of templatesToDraw) {
      console.log(`Template:`);
      console.log(template);

      // Draws the each template on the tile based on it's relative position
      context.drawImage(template.bitmap, Number(template.pixelCoords[0]) * this.drawMult, Number(template.pixelCoords[1]) * this.drawMult);
    }

    return await canvas.convertToBlob({ type: 'image/png' });
  }

  /** Imports the JSON object, and appends it to any JSON object already loaded
   * @param {string} json - The JSON string to parse
   */
  async importJSON(json) {

    console.log(`Importing JSON...`);
    console.log(json);

    // Determine acceptable identifiers (legacy + current script name sans spaces)
    const currentName = (this.name || '').replace(/\s+/g, '');
    // Accept legacy and common typo variants so user renames don't drop data
    const acceptedWhoami = ['BlueMarble', 'BluePeanits', 'BluePeanuts', currentName];

    // If object lacks whoami but has a templates map, assume it's ours and inject an identifier
    if (!json?.whoami && json?.templates && typeof json.templates === 'object') {
      json.whoami = currentName;
    }

    if (json && acceptedWhoami.includes(json?.whoami)) {
      // Initialize or merge templatesJSON so later saves don't overwrite imported data
      if (!this.templatesJSON) {
        // Store original object so subsequent createTemplate() appends instead of recreating
        this.templatesJSON = json;
      } else if (json?.templates) {
        // Merge any templates not already present
        for (const key of Object.keys(json.templates)) {
          if (!this.templatesJSON.templates[key]) {
            this.templatesJSON.templates[key] = json.templates[key];
          }
        }
      }
      // Parse templates into runtime array (legacy parser builds template instances)
  await this.#parseBlueMarble(json).catch(e => console.error('[BlueMarble] Failed to parse templates:', e));
    } else {
      console.warn(`Template JSON 'whoami' ("${json?.whoami}") did not match any accepted identifiers: ${acceptedWhoami.join(', ')}`);
    }
  }

  /** Parses the Blue Peanits JSON object
   * @param {string} json - The JSON string to parse
   * @since 0.72.13
   */
  async #parseBlueMarble(json) {

    console.log(`Parsing BlueMarble...`);

    const templates = json.templates;

    console.log(`BlueMarble length: ${Object.keys(templates).length}`);

    if (Object.keys(templates).length > 0) {

      for (const template in templates) {

        const templateKey = template;
        const templateValue = templates[template];
        console.log(templateKey);

        if (templates.hasOwnProperty(template)) {

          const templateKeyArray = templateKey.split(' '); // E.g., "0 $Z" -> ["0", "$Z"]
          const sortID = Number(templateKeyArray?.[0]); // Sort ID of the template
          const authorID = templateKeyArray?.[1] || '0'; // User ID of the person who exported the template
          const displayName = templateValue.name || `Template ${sortID || ''}`; // Display name of the template
          const enabled = templateValue.enabled !== undefined ? templateValue.enabled : true; // Whether template is enabled
          //const coords = templateValue?.coords?.split(',').map(Number); // "1,2,3,4" -> [1, 2, 3, 4]
          const tilesbase64 = templateValue.tiles;
          const templateTiles = {}; // Stores the template bitmap tiles for each tile.

          for (const tile in tilesbase64) {
            console.log(tile);
            if (tilesbase64.hasOwnProperty(tile)) {
              const encodedTemplateBase64 = tilesbase64[tile];
              const templateUint8Array = base64ToUint8(encodedTemplateBase64); // Base 64 -> Uint8Array

              const templateBlob = new Blob([templateUint8Array], { type: "image/png" }); // Uint8Array -> Blob
              const templateBitmap = await createImageBitmap(templateBlob) // Blob -> Bitmap
              templateTiles[tile] = templateBitmap;
            }
          }

          // Creates a new Template class instance
          const template = new Template({
            displayName: displayName,
            sortID: sortID || this.templatesArray?.length || 0,
            authorID: authorID || '',
            enabled: enabled
            //coords: coords
          });
          template.chunked = templateTiles;
          
          // Accurate pixel count resolution:
          // If the JSON already persisted an exact pixelCount, trust it.
          // Otherwise, reconstruct the count from the shredded 3× scaled tile bitmaps.
          if (typeof templateValue.pixelCount === 'number' && templateValue.pixelCount >= 0) {
            template.pixelCount = templateValue.pixelCount;
          } else {
            try {
              template.pixelCount = await this.#computePixelCountFromTiles(templateTiles);
              // Persist back so subsequent saves keep the improved value
              templateValue.pixelCount = template.pixelCount;
            } catch (e) {
              console.warn('[BlueMarble] Failed to compute precise pixel count; falling back to heuristic:', e);
              const tileCount = Object.keys(templateTiles).length || 1;
              template.pixelCount = tileCount * 500; // fallback heuristic
              templateValue.pixelCount = template.pixelCount;
            }
          }
          
          this.templatesArray.push(template);
          console.log(this.templatesArray);
          console.log(`^^^ This ^^^`);
        }
      }
    }
  }

  /** Parses the OSU! Place JSON object
   */
  #parseOSU() {

  }

  /** Updates the display name of a specific template
   * @param {string} templateKey - The key of the template to update (e.g. "0 $Z")
   * @param {string} newName - The new display name for the template
   * @since 0.81.1
   */
  async updateTemplateName(templateKey, newName) {
    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON();}

    // Update the name in JSON
    if (this.templatesJSON.templates[templateKey]) {
      this.templatesJSON.templates[templateKey].name = newName;
    }

    // Update the name in the template array
    const [sortID, authorID] = templateKey.split(' ');
    const template = this.templatesArray.find(t => 
      t.sortID == Number(sortID) && t.authorID === authorID
    );
    if (template) {
      template.displayName = newName;
    }

    await this.#storeTemplates();
  }

  /** Sets the `templatesShouldBeDrawn` boolean to a value.
   * @param {boolean} value - The value to set the boolean to
   * @since 0.73.7
   */
  setTemplatesShouldBeDrawn(value) {
    this.templatesShouldBeDrawn = value;
  }

  /** Sets all templates to enabled or disabled
   * @param {boolean} enabled - Whether all templates should be enabled
   * @since 0.80.0
   */
  async setAllTemplatesEnabled(enabled) {
    const templates = this.getAllTemplates();
    for (const template of templates) {
      await this.toggleTemplate(template.key, enabled);
    }
  }

  /** Computes the original (unshredded) pixel count from shredded 3x scaled tile bitmaps.
   * Each logical pixel survives only at coordinates where (x % 3 == 1 && y % 3 == 1) with alpha > 0.
   * @param {Object<string, ImageBitmap>} tileBitmaps - Map of tile key -> shredded ImageBitmap
   * @returns {Promise<number>} Total reconstructed pixel count
   * @since 0.81.1
   */
  async #computePixelCountFromTiles(tileBitmaps) {
    let total = 0;
    // Use OffscreenCanvas when available; else fallback to standard canvas
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    const canvas = useOffscreen ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (const key of Object.keys(tileBitmaps)) {
      const bmp = tileBitmaps[key];
      if (!bmp) continue;
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      ctx.clearRect(0, 0, bmp.width, bmp.height);
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      // Iterate only center points of each 3x3 cluster to reduce iterations ~9x
      for (let y = 1; y < height; y += 3) {
        for (let x = 1; x < width; x += 3) {
          const idx = (y * width + x) * 4;
            // Count any non-transparent center pixel as one logical pixel
          if (data[idx + 3] > 0) total++;
        }
      }
    }
    return total;
  }
}
