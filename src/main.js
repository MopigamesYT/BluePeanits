/** @file The main file. Everything in the userscript is executed from here.
 * @since 0.0.0
 */

import Overlay from './Overlay.js';
import Observers from './observers.js';
import ApiManager from './apiManager.js';
import TemplateManager from './templateManager.js';
import { consoleLog, consoleWarn } from './utils.js';

const name = GM_info.script.name.toString(); // Name of userscript
const version = GM_info.script.version.toString(); // Version of userscript
const consoleStyle = 'color: cornflowerblue;'; // The styling for the console logs

/** Injects code into the client
 * This code will execute outside of TamperMonkey's sandbox
 * @param {*} callback - The code to execute
 * @since 0.11.15
 */
function inject(callback) {
    const script = document.createElement('script');
    script.setAttribute('bm-name', name); // Passes in the name value
    script.setAttribute('bm-cStyle', consoleStyle); // Passes in the console style value
    script.textContent = `(${callback})();`;
    document.documentElement?.appendChild(script);
    script.remove();
}

/** What code to execute instantly in the client (webpage) to spy on fetch calls.
 * This code will execute outside of TamperMonkey's sandbox.
 * @since 0.11.15
 */
inject(() => {

  const script = document.currentScript; // Gets the current script HTML Script Element
  const name = script?.getAttribute('bm-name') || 'Blue Peanits'; // Gets the name value that was passed in. Defaults to "Blue Peanits" if nothing was found
  const consoleStyle = script?.getAttribute('bm-cStyle') || ''; // Gets the console style value that was passed in. Defaults to no styling if nothing was found
  const fetchedBlobQueue = new Map(); // Blobs being processed

  window.addEventListener('message', (event) => {
    const { source, endpoint, blobID, blobData, blink } = event.data;

    const elapsed = Date.now() - blink;

    // Since this code does not run in the userscript, we can't use consoleLog().
    console.groupCollapsed(`%c${name}%c: ${fetchedBlobQueue.size} Recieved IMAGE message about blob "${blobID}"`, consoleStyle, '');
    console.log(`Blob fetch took %c${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000) % 60).padStart(2,'0')}.${String(elapsed % 1000).padStart(3,'0')}%c MM:SS.mmm`, consoleStyle, '');
    console.log(fetchedBlobQueue);
    console.groupEnd();

    // The modified blob won't have an endpoint, so we ignore any message without one.
    if ((source == 'blue-marble') && !!blobID && !!blobData && !endpoint) {

      const callback = fetchedBlobQueue.get(blobID); // Retrieves the blob based on the UUID

      // If the blobID is a valid function...
      if (typeof callback === 'function') {

        callback(blobData); // ...Retrieve the blob data from the blobID function
      } else {
        // ...else the blobID is unexpected. We don't know what it is, but we know for sure it is not a blob. This means we ignore it.

        consoleWarn(`%c${name}%c: Attempted to retrieve a blob (%s) from queue, but the blobID was not a function! Skipping...`, consoleStyle, '', blobID);
      }

      fetchedBlobQueue.delete(blobID); // Delete the blob from the queue, because we don't need to process it again
    }
  });

  // Spys on "spontaneous" fetch requests made by the client
  const originalFetch = window.fetch; // Saves a copy of the original fetch

  // Overrides fetch
  window.fetch = async function(...args) {

    const response = await originalFetch.apply(this, args); // Sends a fetch
    const cloned = response.clone(); // Makes a copy of the response

    // Retrieves the endpoint name. Unknown endpoint = "ignore"
    const endpointName = ((args[0] instanceof Request) ? args[0]?.url : args[0]) || 'ignore';

    // Check Content-Type to only process JSON
    const contentType = cloned.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {


      // Since this code does not run in the userscript, we can't use consoleLog().
      console.log(`%c${name}%c: Sending JSON message about endpoint "${endpointName}"`, consoleStyle, '');

      // Sends a message about the endpoint it spied on
      cloned.json()
        .then(jsonData => {
          window.postMessage({
            source: 'blue-marble',
            endpoint: endpointName,
            jsonData: jsonData
          }, '*');
        })
        .catch(err => {
          console.error(`%c${name}%c: Failed to parse JSON: `, consoleStyle, '', err);
        });
    } else if (contentType.includes('image/') && (!endpointName.includes('openfreemap') && !endpointName.includes('maps'))) {
      // Fetch custom for all images but opensourcemap

      const blink = Date.now(); // Current time

      const blob = await cloned.blob(); // The original blob

      // Since this code does not run in the userscript, we can't use consoleLog().
      console.log(`%c${name}%c: ${fetchedBlobQueue.size} Sending IMAGE message about endpoint "${endpointName}"`, consoleStyle, '');

      // Returns the manipulated blob
      return new Promise((resolve) => {
        const blobUUID = crypto.randomUUID(); // Generates a random UUID

        // Store the blob while we wait for processing
        fetchedBlobQueue.set(blobUUID, (blobProcessed) => {
          // The response that triggers when the blob is finished processing

          // Creates a new response
          resolve(new Response(blobProcessed, {
            headers: cloned.headers,
            status: cloned.status,
            statusText: cloned.statusText
          }));

          // Since this code does not run in the userscript, we can't use consoleLog().
          console.log(`%c${name}%c: ${fetchedBlobQueue.size} Processed blob "${blobUUID}"`, consoleStyle, '');
        });

        window.postMessage({
          source: 'blue-marble',
          endpoint: endpointName,
          blobID: blobUUID,
          blobData: blob,
          blink: blink
        });
      }).catch(exception => {
        const elapsed = Date.now();
        console.error(`%c${name}%c: Failed to Promise blob!`, consoleStyle, '');
        console.groupCollapsed(`%c${name}%c: Details of failed blob Promise:`, consoleStyle, '');
        console.log(`Endpoint: ${endpointName}\nThere are ${fetchedBlobQueue.size} blobs processing...\nBlink: ${blink.toLocaleString()}\nTime Since Blink: ${String(Math.floor(elapsed/60000)).padStart(2,'0')}:${String(Math.floor(elapsed/1000) % 60).padStart(2,'0')}.${String(elapsed % 1000).padStart(3,'0')} MM:SS.mmm`);
        console.error(`Exception stack:`, exception);
        console.groupEnd();
      });

      // cloned.blob().then(blob => {
      //   window.postMessage({
      //     source: 'blue-marble',
      //     endpoint: endpointName,
      //     blobData: blob
      //   }, '*');
      // });
    }

    return response; // Returns the original response
  };
});

// Imports the CSS directly embedded (minified for size)
const cssOverlay = `#bm-overlay{position:fixed;background-color:rgba(21,48,99,0.9);color:white;padding:10px;border-radius:8px;z-index:9000;transition:all 0.3s ease,transform 0s;max-width:300px;width:auto;will-change:transform;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-style:preserve-3d;-webkit-transform-style:preserve-3d}#bm-contain-userinfo,#bm-overlay hr,#bm-contain-automation,#bm-contain-buttons-action{transition:opacity 0.2s ease,height 0.2s ease}div#bm-overlay{font-family:'Roboto Mono','Courier New','Monaco','DejaVu Sans Mono',monospace,'Arial';letter-spacing:0.05em}#bm-bar-drag{margin-bottom:0.5em;background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><circle cx="3" cy="3" r="1.5" fill="CornflowerBlue" /></svg>') repeat;cursor:grab;width:100%;height:1em;transition:margin-bottom 0.2s ease}#bm-bar-drag.dragging{cursor:grabbing;pointer-events:auto}#bm-overlay:has(#bm-bar-drag.dragging){pointer-events:none;user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none}#bm-contain-header{margin-bottom:0.5em}#bm-contain-header[style*="text-align: center"]{display:flex;flex-direction:column;align-items:center;justify-content:center}#bm-overlay[style*="padding: 5px"]{width:auto!important;max-width:300px;min-width:200px}#bm-overlay img{display:inline-block;height:2.5em;margin-right:1ch;vertical-align:middle;transition:opacity 0.2s ease}#bm-contain-header[style*="text-align: center"] img{margin-right:0;margin-left:0;display:block;margin:0 auto}#bm-overlay h1{display:inline-block;font-size:x-large;font-weight:bold;vertical-align:middle}#bm-contain-automation input[type="checkbox"]{vertical-align:middle;margin-right:0.5ch}#bm-contain-automation label{margin-right:0.5ch}.bm-help{border:white 1px solid;height:1.5em;width:1.5em;margin-top:2px;text-align:center;line-height:1em;padding:0!important}#bm-button-coords{vertical-align:middle}#bm-button-coords svg{width:50%;margin:0 auto;fill:#111}#bm-coords-container{display:flex;gap:0.5ch;align-items:center}#bm-button-auto-coords{background-color:#666;font-size:0.7em;padding:0.1em 0.3em;border-radius:0.5em;transition:background-color 0.2s ease}#bm-button-auto-coords.active{background-color:#4CAF50}#bm-button-auto-coords:hover{background-color:#777}#bm-button-auto-coords.active:hover{background-color:#45a049}#bm-button-dark-theme{background-color:#444!important;border:1px solid #666!important;transition:all 0.2s ease}#bm-button-dark-theme.active{background-color:#1a1a1a!important;border-color:#888!important}#bm-button-dark-theme:hover{background-color:#555!important}#bm-button-dark-theme.active:hover{background-color:#333!important}div:has(> #bm-button-teleport){display:flex;gap:0.5ch}#bm-button-favorite svg,#bm-button-template svg{height:1em;margin:0 auto;margin-top:2px;text-align:center;line-height:1em;vertical-align:bottom}#bm-contain-coords input[type="number"]{appearance:auto;-moz-appearance:textfield;width:5.5ch;margin-left:1ch;background-color:rgba(0,0,0,0.2);padding:0 0.5ch;font-size:small}#bm-contain-coords input[type="number"]::-webkit-outer-spin-button,#bm-contain-coords input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}#bm-contain-buttons-template{display:grid;grid-template-columns:1fr 1fr;gap:0.5em;align-items:center}#bm-button-manage{grid-column:1/-1;margin-bottom:0.5em}div:has(> #bm-input-file-template) > button{width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#bm-input-file-template,input[type="file"][id*="template"]{display:none!important;visibility:hidden!important;position:absolute!important;left:-9999px!important;top:-9999px!important;width:0!important;height:0!important;opacity:0!important;z-index:-9999!important;pointer-events:none!important}#bm-output-status{font-size:small;background-color:rgba(0,0,0,0.2);padding:0 0.5ch;height:3.75em;width:100%}#bm-contain-buttons-action{display:flex;justify-content:space-between}#bm-overlay small{font-size:x-small;color:lightgray}#bm-contain-userinfo,#bm-contain-automation,#bm-contain-coords,#bm-contain-buttons-template,div:has(> #bm-input-file-template),#bm-output-status{margin-top:0.5em}#bm-overlay button{background-color:#144eb9;border-radius:1em;padding:0 0.75ch}#bm-overlay button:hover,#bm-overlay button:focus-visible{background-color:#1061e5}#bm-overlay button:active,#bm-overlay button:disabled{background-color:#2e97ff}#bm-overlay button:disabled{text-decoration:line-through}#bm-template-manager{position:fixed;background-color:rgba(21,48,99,0.95);color:white;padding:15px;border-radius:8px;z-index:9001;max-width:450px;min-width:400px;max-height:80vh;overflow:hidden;font-family:'Roboto Mono','Courier New','Monaco','DejaVu Sans Mono',monospace,'Arial';letter-spacing:0.05em;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:all 0.3s ease,transform 0s;will-change:transform;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-style:preserve-3d;-webkit-transform-style:preserve-3d}#bm-template-drag{margin-bottom:0.5em;background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><circle cx="3" cy="3" r="1.5" fill="CornflowerBlue" /></svg>') repeat;cursor:grab;width:100%;height:1em}#bm-template-drag.dragging{cursor:grabbing}#bm-template-controls{display:flex;gap:0.5em;margin-bottom:1em}#bm-template-controls button{flex:1;background-color:#144eb9;border-radius:1em;padding:0.5em;font-size:0.9em}#bm-template-controls button:hover{background-color:#1061e5}#bm-template-list{max-height:300px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#144eb9 rgba(0,0,0,0.2)}#bm-template-list::-webkit-scrollbar{width:8px}#bm-template-list::-webkit-scrollbar-track{background:rgba(0,0,0,0.2);border-radius:4px}#bm-template-list::-webkit-scrollbar-thumb{background:#144eb9;border-radius:4px}#bm-template-list::-webkit-scrollbar-thumb:hover{background:#1061e5}.bm-template-item{transition:all 0.2s ease}.bm-template-item:hover{background-color:rgba(0,0,0,0.35)!important;transform:translateX(2px)}#bm-template-stats{font-size:0.9em;color:#ccc}#bm-template-stats p{margin:0.25em 0}#bm-template-close{background-color:#d32f2f!important;color:white;border:none;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:bold}#bm-template-close:hover{background-color:#f44336!important}body.bm-dark-theme{background-color:#1a1a1a!important;color:#e0e0e0!important;color-scheme:dark!important;--color-base-100:rgb(26,26,26)!important;--color-base-200:oklch(15% .011 259.822)!important;--color-base-300:oklch(20% .016 262.751)!important;--color-base-content:oklch(85% .053 255.824)!important;--color-primary:oklch(65% .255 257.57)!important;--color-primary-content:oklch(15% .051 257.57)!important;--color-secondary:oklch(50% .161 282.339)!important;--color-secondary-content:oklch(20% .032 282.339)!important;--color-accent:oklch(70% .191 335.171)!important;--color-accent-content:oklch(15% .038 335.171)!important;--color-neutral:oklch(80% .063 257.651)!important;--color-neutral-content:oklch(25% .012 257.651)!important;--color-info:oklch(70% .085 214.515)!important;--color-info-content:oklch(15% .017 214.515)!important;--color-success:oklch(65% .077 197.823)!important;--color-success-content:oklch(15% .015 197.823)!important;--color-warning:oklch(75% .045 71.47)!important;--color-warning-content:oklch(15% .009 71.47)!important;--color-error:oklch(65% .11 20.076)!important;--color-error-content:oklch(15% .022 20.076)!important}body.bm-dark-theme *{color:#e0e0e0!important}body.bm-dark-theme .navbar,body.bm-dark-theme .navbar-brand,body.bm-dark-theme .nav-link{background-color:#2d2d2d!important;border-color:#444!important}body.bm-dark-theme .btn{background-color:#444!important;border-color:#666!important;color:#e0e0e0!important}body.bm-dark-theme .btn:hover{background-color:#555!important}body.bm-dark-theme .card,body.bm-dark-theme .modal-content{background-color:#2d2d2d!important;border-color:#444!important}body.bm-dark-theme input,body.bm-dark-theme select,body.bm-dark-theme textarea{background-color:#333!important;border-color:#555!important;color:#e0e0e0!important}body.bm-dark-theme .bg-light{background-color:#333!important}body.bm-dark-theme .text-dark{color:#e0e0e0!important}body.bm-dark-theme .border{border-color:#444!important}body.bm-dark-theme .container,body.bm-dark-theme .row,body.bm-dark-theme .col{background-color:transparent!important}#bm-template-info{position:fixed;background-color:rgba(21,48,99,0.98);color:white;padding:20px;border-radius:10px;z-index:9002;max-width:600px;min-width:500px;max-height:85vh;overflow-y:auto;font-family:'Roboto Mono','Courier New','Monaco','DejaVu Sans Mono',monospace,'Arial';letter-spacing:0.05em;box-shadow:0 6px 30px rgba(0,0,0,0.4);transition:all 0.3s ease}#bm-template-info .info-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1em;border-bottom:1px solid rgba(255,255,255,0.3);padding-bottom:0.5em}#bm-template-info .info-preview{text-align:center;margin:1em 0;background:rgba(0,0,0,0.3);border-radius:6px;padding:1em}#bm-template-info .info-preview canvas{max-width:100%;max-height:200px;border:1px solid #666;border-radius:4px;image-rendering:pixelated}#bm-template-info .info-section{margin:1em 0;padding:0.75em;background:rgba(0,0,0,0.2);border-radius:6px}#bm-template-info .info-section h4{margin:0 0 0.5em 0;color:#87CEEB;font-size:1em}#bm-template-info .color-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5em;margin-top:0.5em}#bm-template-info .color-item{display:flex;align-items:center;gap:0.5em;padding:0.3em;background:rgba(255,255,255,0.1);border-radius:3px}#bm-template-info .color-swatch{width:20px;height:20px;border-radius:3px;border:1px solid #666;flex-shrink:0}#bm-template-info .color-info{font-size:0.8em;flex:1;min-width:0}#bm-template-info .info-stats{display:grid;grid-template-columns:1fr 1fr;gap:1em}#bm-template-info .stat-item{text-align:center;padding:0.5em;background:rgba(255,255,255,0.1);border-radius:4px}#bm-template-info .stat-value{font-size:1.2em;font-weight:bold;color:#87CEEB}#bm-template-info .stat-label{font-size:0.8em;opacity:0.8}#bm-template-info input[type="number"]{appearance:textfield;-moz-appearance:textfield}#bm-template-info input[type="number"]::-webkit-outer-spin-button,#bm-template-info input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}#bm-template-info button:hover{opacity:0.8;transform:translateY(-1px)}`;
GM_addStyle(cssOverlay);

// Imports the Roboto Mono font family
var stylesheetLink = document.createElement('link');
stylesheetLink.href = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap';
stylesheetLink.rel = 'preload';
stylesheetLink.as = 'style';
stylesheetLink.onload = function () {
  this.onload = null;
  this.rel = 'stylesheet';
};
document.head?.appendChild(stylesheetLink);

// CONSTRUCTORS
const observers = new Observers(); // Constructs a new Observers object
const overlayMain = new Overlay(name, version); // Constructs a new Overlay object for the main overlay
const overlayTabTemplate = new Overlay(name, version); // Constructs a Overlay object for the template tab
const templateManager = new TemplateManager(name, version, overlayMain); // Constructs a new TemplateManager object
const apiManager = new ApiManager(templateManager); // Constructs a new ApiManager object

overlayMain.setApiManager(apiManager); // Sets the API manager

let storageTemplates = {};
try {
  storageTemplates = JSON.parse(GM_getValue('bmTemplates', '{}')) || {};
} catch (e) {
  console.warn('[BlueMarble] Failed to parse GM stored templates:', e);
  storageTemplates = {};
}

// If empty, attempt migration from localStorage backup (handles @name changes)
if (!storageTemplates.templates || Object.keys(storageTemplates.templates || {}).length === 0) {
  try {
    const ls = localStorage.getItem('BlueMarbleTemplates');
    if (ls) {
      const parsed = JSON.parse(ls);
      if (parsed && parsed.templates && Object.keys(parsed.templates).length) {
        console.info('[BlueMarble] Migrating templates from localStorage backup.');
        storageTemplates = parsed;
      }
    }
  } catch (e) {
    console.warn('[BlueMarble] Failed localStorage migration attempt:', e);
  }
}

console.log(storageTemplates);
// Ensure templates are imported before we start intercepting tiles
Promise.resolve(templateManager.importJSON(storageTemplates))
  .then(()=>console.info('[BlueMarble] Templates imported'))
  .catch(e=>console.error('[BlueMarble] Template import failed', e));

buildOverlayMain(); // Builds the main overlay
buildTemplateManager(); // Builds the template manager overlay

overlayMain.handleDrag('#bm-overlay', '#bm-bar-drag'); // Creates dragging capability on the drag bar for dragging the overlay

apiManager.spontaneousResponseListener(overlayMain); // Reads spontaneous fetch responces

observeBlack(); // Observes the black palette color

// Add keyboard shortcuts for template management
document.addEventListener('keydown', (event) => {
  // Only trigger if no input elements are focused
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    return;
  }
  
  // Ctrl+T to toggle template manager
  if (event.ctrlKey && event.key === 't') {
    event.preventDefault();
    const templateManagerPanel = document.querySelector('#bm-template-manager');
    const manageButton = document.querySelector('#bm-button-manage');
    if (templateManagerPanel) {
      const isCurrentlyOpen = templateManagerPanel.style.display !== 'none';
      templateManagerPanel.style.display = isCurrentlyOpen ? 'none' : 'block';
      
      if (!isCurrentlyOpen) {
        if (window.refreshTemplateList) refreshTemplateList();
        if (manageButton) {
          manageButton.style.backgroundColor = '#2e97ff';
          manageButton.style.fontWeight = 'bold';
        }
      } else {
        if (manageButton) {
          manageButton.style.backgroundColor = '';
          manageButton.style.fontWeight = '';
        }
      }
    }
  }
  
  // Ctrl+Shift+E to enable all templates
  if (event.ctrlKey && event.shiftKey && event.key === 'E') {
    event.preventDefault();
    if (templateManager && templateManager.setAllTemplatesEnabled) {
      templateManager.setAllTemplatesEnabled(true);
      if (window.refreshTemplateList) refreshTemplateList();
      overlayMain.handleDisplayStatus('All templates enabled via keyboard shortcut!');
    }
  }
  
  // Ctrl+Shift+D to disable all templates
  if (event.ctrlKey && event.shiftKey && event.key === 'D') {
    event.preventDefault();
    if (templateManager && templateManager.setAllTemplatesEnabled) {
      templateManager.setAllTemplatesEnabled(false);
      if (window.refreshTemplateList) refreshTemplateList();
      overlayMain.handleDisplayStatus('All templates disabled via keyboard shortcut!');
    }
  }
});

consoleLog(`%c${name}%c (${version}) userscript has loaded!`, 'color: cornflowerblue;', '');

/** Observe the black color, and add the "Move" button.
 * @since 0.66.3
 */
function observeBlack() {
  const observer = new MutationObserver((mutations, observer) => {

    const black = document.querySelector('#color-1'); // Attempt to retrieve the black color element for anchoring

    if (!black) {return;} // Black color does not exist yet. Kills iteself

    let move = document.querySelector('#bm-button-move'); // Tries to find the move button

    // If the move button does not exist, we make a new one
    if (!move) {
      move = document.createElement('button');
      move.id = 'bm-button-move';
      move.textContent = 'Move ↑';
      move.className = 'btn btn-soft';
      move.onclick = function() {
        const roundedBox = this.parentNode.parentNode.parentNode.parentNode; // Obtains the rounded box
        const shouldMoveUp = (this.textContent == 'Move ↑');
        roundedBox.parentNode.className = roundedBox.parentNode.className.replace(shouldMoveUp ? 'bottom' : 'top', shouldMoveUp ? 'top' : 'bottom'); // Moves the rounded box to the top
        roundedBox.style.borderTopLeftRadius = shouldMoveUp ? '0px' : 'var(--radius-box)';
        roundedBox.style.borderTopRightRadius = shouldMoveUp ? '0px' : 'var(--radius-box)';
        roundedBox.style.borderBottomLeftRadius = shouldMoveUp ? 'var(--radius-box)' : '0px';
        roundedBox.style.borderBottomRightRadius = shouldMoveUp ? 'var(--radius-box)' : '0px';
        this.textContent = shouldMoveUp ? 'Move ↓' : 'Move ↑';
      }

      // Attempts to find the "Paint Pixel" element for anchoring
      const paintPixel = black.parentNode.parentNode.parentNode.parentNode.querySelector('h2');

      paintPixel.parentNode?.appendChild(move); // Adds the move button
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/** Deploys the overlay to the page with minimize/maximize functionality.
 * Creates a responsive overlay UI that can toggle between full-featured and minimized states.
 * 
 * Parent/child relationships in the DOM structure below are indicated by indentation.
 * @since 0.58.3
 */
function buildOverlayMain() {
  let isMinimized = false; // Overlay state tracker (false = maximized, true = minimized)
  
  overlayMain.addDiv({'id': 'bm-overlay', 'style': 'top: 10px; right: 75px;'})
    .addDiv({'id': 'bm-contain-header'})
      .addDiv({'id': 'bm-bar-drag'}).buildElement()
      .addImg({'alt': 'Blue Peanits Icon - Click to minimize/maximize', 'src': 'https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/main/dist/assets/Favicon.png', 'style': 'cursor: pointer;'}, 
        (instance, img) => {
          /** Click event handler for overlay minimize/maximize functionality.
           * 
           * Toggles between two distinct UI states:
           * 1. MINIMIZED STATE (60×76px):
           *    - Shows only the Blue Peanits icon and drag bar
           *    - Hides all input fields, buttons, and status information
           *    - Applies fixed dimensions for consistent appearance
           *    - Repositions icon with 3px right offset for visual centering
           * 
           * 2. MAXIMIZED STATE (responsive):
           *    - Restores full functionality with all UI elements
           *    - Removes fixed dimensions to allow responsive behavior
           *    - Resets icon positioning to default alignment
           *    - Shows success message when returning to maximized state
           * 
           * @param {Event} event - The click event object (implicit)
           */
          img.addEventListener('click', () => {
            isMinimized = !isMinimized; // Toggle the current state

            const overlay = document.querySelector('#bm-overlay');
            const header = document.querySelector('#bm-contain-header');
            const dragBar = document.querySelector('#bm-bar-drag');
            const coordsContainer = document.querySelector('#bm-contain-coords');
            const coordsButton = document.querySelector('#bm-button-coords');
            const autoCoordsButton = document.querySelector('#bm-button-auto-coords');
            const manageButton = document.querySelector('#bm-button-manage');
            const createButton = document.querySelector('#bm-button-create');
            const enableButton = document.querySelector('#bm-button-enable');
            const disableButton = document.querySelector('#bm-button-disable');
            const coordInputs = document.querySelectorAll('#bm-contain-coords input');
            
            // Pre-restore original dimensions when switching to maximized state
            // This ensures smooth transition and prevents layout issues
            if (!isMinimized) {
              overlay.style.width = "auto";
              overlay.style.maxWidth = "300px";
              overlay.style.minWidth = "200px";
              overlay.style.padding = "10px";
            }
            
            // Define elements that should be hidden/shown during state transitions
            // Each element is documented with its purpose for maintainability
            const elementsToToggle = [
              '#bm-overlay h1',                    // Main title "Blue Peanits"
              '#bm-contain-userinfo',              // User information section (username, droplets, level)
              '#bm-overlay hr',                    // Visual separator lines
              '#bm-contain-automation > *:not(#bm-contain-coords)', // Automation section excluding coordinates
              '#bm-input-file-template',           // Template file upload interface
              '#bm-contain-buttons-action',        // Action buttons container
              `#${instance.outputStatusId}`        // Status log textarea for user feedback
            ];
            
            // Apply visibility changes to all toggleable elements
            elementsToToggle.forEach(selector => {
              const elements = document.querySelectorAll(selector);
              elements.forEach(element => {
                element.style.display = isMinimized ? 'none' : '';
              });
            });
            // Handle coordinate container and button visibility based on state
            if (isMinimized) {
              // ==================== MINIMIZED STATE CONFIGURATION ====================
              // In minimized state, we hide ALL interactive elements except the icon and drag bar
              // This creates a clean, unobtrusive interface that maintains only essential functionality
              
              // Hide coordinate input container completely
              if (coordsContainer) {
                coordsContainer.style.display = 'none';
              }
              
              // Hide coordinate button (pin icon)
              if (coordsButton) {
                coordsButton.style.display = 'none';
              }
              
              // Hide auto-coordinates button  
              if (autoCoordsButton) {
                autoCoordsButton.style.display = 'none';
              }
              
              // Hide manage templates button
              if (manageButton) {
                manageButton.style.display = 'none';
              }
              
              // Hide create template button
              if (createButton) {
                createButton.style.display = 'none';
              }

              // Hide enable templates button
              if (enableButton) {
                enableButton.style.display = 'none';
              }

              // Hide disable templates button
              if (disableButton) {
                disableButton.style.display = 'none';
              }
              
              // Hide all coordinate input fields individually (failsafe)
              coordInputs.forEach(input => {
                input.style.display = 'none';
              });
              
              // Apply fixed dimensions for consistent minimized appearance
              // These dimensions were chosen to accommodate the icon while remaining compact
              overlay.style.width = '60px';    // Fixed width for consistency
              overlay.style.height = '76px';   // Fixed height (60px + 16px for better proportions)
              overlay.style.maxWidth = '60px';  // Prevent expansion
              overlay.style.minWidth = '60px';  // Prevent shrinking
              overlay.style.padding = '8px';    // Comfortable padding around icon
              
              // Apply icon positioning for better visual centering in minimized state
              // The 3px offset compensates for visual weight distribution
              img.style.marginLeft = '3px';
              
              // Configure header layout for minimized state
              header.style.textAlign = 'center';
              header.style.margin = '0';
              header.style.marginBottom = '0';
              
              // Ensure drag bar remains visible and properly spaced
              if (dragBar) {
                dragBar.style.display = '';
                dragBar.style.marginBottom = '0.25em';
              }
            } else {
              // ==================== MAXIMIZED STATE RESTORATION ====================
              // In maximized state, we restore all elements to their default functionality
              // This involves clearing all style overrides applied during minimization
              
              // Restore coordinate container to default state
              if (coordsContainer) {
                coordsContainer.style.display = '';           // Show container
                coordsContainer.style.flexDirection = '';     // Reset flex layout
                coordsContainer.style.justifyContent = '';    // Reset alignment
                coordsContainer.style.alignItems = '';        // Reset alignment
                coordsContainer.style.gap = '';               // Reset spacing
                coordsContainer.style.textAlign = '';         // Reset text alignment
                coordsContainer.style.margin = '';            // Reset margins
              }
              
              // Restore coordinate button visibility
              if (coordsButton) {
                coordsButton.style.display = '';
              }
              
              // Restore auto-coordinates button visibility
              if (autoCoordsButton) {
                autoCoordsButton.style.display = '';
              }
              
              // Restore manage templates button visibility
              if (manageButton) {
                manageButton.style.display = '';
              }
              
              // Restore create button visibility and reset positioning
              if (createButton) {
                createButton.style.display = '';
                createButton.style.marginTop = '';
              }

              // Restore enable button visibility and reset positioning
              if (enableButton) {
                enableButton.style.display = '';
                enableButton.style.marginTop = '';
              }

              // Restore disable button visibility and reset positioning
              if (disableButton) {
                disableButton.style.display = '';
                disableButton.style.marginTop = '';
              }
              
              // Restore all coordinate input fields
              coordInputs.forEach(input => {
                input.style.display = '';
              });
              
              // Reset icon positioning to default (remove minimized state offset)
              img.style.marginLeft = '';
              
              // Restore overlay to responsive dimensions
              overlay.style.padding = '10px';
              
              // Reset header styling to defaults
              header.style.textAlign = '';
              header.style.margin = '';
              header.style.marginBottom = '';
              
              // Reset drag bar spacing
              if (dragBar) {
                dragBar.style.marginBottom = '0.5em';
              }
              
              // Remove all fixed dimensions to allow responsive behavior
              // This ensures the overlay can adapt to content changes
              overlay.style.width = '';
              overlay.style.height = '';
            }
            
            // ==================== ACCESSIBILITY AND USER FEEDBACK ====================
            // Update accessibility information for screen readers and tooltips
            
            // Update alt text to reflect current state for screen readers and tooltips
            img.alt = isMinimized ? 
              'Blue Peanits Icon - Minimized (Click to maximize)' : 
              'Blue Peanits Icon - Maximized (Click to minimize)';
            
            // No status message needed - state change is visually obvious to users
          });
        }
      ).buildElement()
      .addHeader(1, {'textContent': name}).buildElement()
    .buildElement()

    .addHr().buildElement()

    .addDiv({'id': 'bm-contain-userinfo'})
      .addP({'id': 'bm-user-name', 'textContent': 'Username:'}).buildElement()
      .addP({'id': 'bm-user-droplets', 'textContent': 'Droplets:'}).buildElement()
      .addP({'id': 'bm-user-nextlevel', 'textContent': 'Next level in...'}).buildElement()
    .buildElement()

    .addHr().buildElement()

    .addDiv({'id': 'bm-contain-automation'})
      // .addCheckbox({'id': 'bm-input-stealth', 'textContent': 'Stealth', 'checked': true}).buildElement()
      // .addButtonHelp({'title': 'Waits for the website to make requests, instead of sending requests.'}).buildElement()
      // .addBr().buildElement()
      // .addCheckbox({'id': 'bm-input-possessed', 'textContent': 'Possessed', 'checked': true}).buildElement()
      // .addButtonHelp({'title': 'Controls the website as if it were possessed.'}).buildElement()
      // .addBr().buildElement()
      .addDiv({'id': 'bm-contain-coords'})
        .addDiv({'id': 'bm-coords-container'})
          .addButton({'id': 'bm-button-coords', 'className': 'bm-help', 'style': 'margin-top: 0;', 'innerHTML': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 6"><circle cx="2" cy="2" r="2"></circle><path d="M2 6 L3.7 3 L0.3 3 Z"></path><circle cx="2" cy="2" r="0.7" fill="white"></circle></svg></svg>'},
            (instance, button) => {
              button.onclick = () => {
                const coords = instance.apiManager?.coordsTilePixel; // Retrieves the coords from the API manager
                if (!coords?.[0]) {
                  instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?');
                  return;
                }
                instance.updateInnerHTML('bm-input-tx', coords?.[0] || '');
                instance.updateInnerHTML('bm-input-ty', coords?.[1] || '');
                instance.updateInnerHTML('bm-input-px', coords?.[2] || '');
                instance.updateInnerHTML('bm-input-py', coords?.[3] || '');
              }
            }
          ).buildElement()
          .addButton({'id': 'bm-button-auto-coords', 'textContent': 'AUTO', 'title': 'Toggle automatic coordinate filling when clicking the map'},
            (instance, button) => {
              // Initialize button state
              const updateButtonState = () => {
                if (instance.apiManager?.templateManager?.autoCoords) {
                  button.classList.add('active');
                  button.title = 'Auto-coordinates ON - coordinates will be filled automatically when clicking the map';
                } else {
                  button.classList.remove('active');
                  button.title = 'Auto-coordinates OFF - click to enable automatic coordinate filling';
                }
              };
              
              updateButtonState();
              
              button.onclick = () => {
                if (instance.apiManager?.templateManager) {
                  instance.apiManager.templateManager.autoCoords = !instance.apiManager.templateManager.autoCoords;
                  updateButtonState();
                  const status = instance.apiManager.templateManager.autoCoords ? 'enabled' : 'disabled';
                  instance.handleDisplayStatus(`Auto-coordinates ${status}!`);
                }
              };
            }
          ).buildElement()
        .buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-tx', 'placeholder': 'Tl X', 'min': 0, 'max': 2047, 'step': 1, 'required': true}).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-ty', 'placeholder': 'Tl Y', 'min': 0, 'max': 2047, 'step': 1, 'required': true}).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-px', 'placeholder': 'Px X', 'min': 0, 'max': 2047, 'step': 1, 'required': true}).buildElement()
        .addInput({'type': 'number', 'id': 'bm-input-py', 'placeholder': 'Px Y', 'min': 0, 'max': 2047, 'step': 1, 'required': true}).buildElement()
      .buildElement()
      .addInputFile({'id': 'bm-input-file-template', 'textContent': 'Upload Template', 'accept': 'image/png, image/jpeg, image/webp, image/bmp, image/gif'}).buildElement()
      .addDiv({'id': 'bm-contain-buttons-template'})
        .addButton({'id': 'bm-button-manage', 'textContent': 'Manage Templates'}, (instance, button) => {
          // Function to update button text with template count
          const updateButtonText = () => {
            const templates = instance.apiManager?.templateManager?.getAllTemplates() || [];
            const enabledCount = templates.filter(t => t.enabled).length;
            button.textContent = templates.length > 0 ? `Manage (${enabledCount}/${templates.length})` : 'Manage Templates';
          };
          
          button.onclick = (event) => {
            const templateManagerPanel = document.querySelector('#bm-template-manager');
            const isCurrentlyOpen = templateManagerPanel.style.display !== 'none';
            
            // If Shift+Click, toggle inline mode (embed in main overlay)
            if (event.shiftKey) {
              const mainOverlay = document.querySelector('#bm-overlay');
              const inlineContainer = document.querySelector('#bm-template-inline');
              
              if (!inlineContainer) {
                // Create inline template manager
                const inlineDiv = document.createElement('div');
                inlineDiv.id = 'bm-template-inline';
                inlineDiv.innerHTML = `
                  <hr style="margin: 1em 0;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5em;">
                    <h3 style="margin: 0; font-size: 1em;">Templates</h3>
                    <button id="bm-template-inline-close" style="background: #d32f2f; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9em;">×</button>
                  </div>
                  <div id="bm-template-inline-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 0.5em;"></div>
                  <div style="display: flex; gap: 0.5em; font-size: 0.8em;">
                    <button id="bm-inline-enable-all" style="flex: 1; padding: 0.3em;">Enable All</button>
                    <button id="bm-inline-disable-all" style="flex: 1; padding: 0.3em;">Disable All</button>
                  </div>
                `;
                mainOverlay.appendChild(inlineDiv);
                
                // Add event listeners
                document.querySelector('#bm-template-inline-close').onclick = () => {
                  inlineDiv.remove();
                  button.style.backgroundColor = '';
                  button.style.fontWeight = '';
                };
                
                document.querySelector('#bm-inline-enable-all').onclick = async () => {
                  await instance.apiManager?.templateManager?.setAllTemplatesEnabled(true);
                  updateInlineList();
                  instance.handleDisplayStatus('All templates enabled!');
                };
                
                document.querySelector('#bm-inline-disable-all').onclick = async () => {
                  await instance.apiManager?.templateManager?.setAllTemplatesEnabled(false);
                  updateInlineList();
                  instance.handleDisplayStatus('All templates disabled!');
                };
                
                // Function to update inline list
                window.updateInlineList = () => {
                  const templates = instance.apiManager?.templateManager?.getAllTemplates() || [];
                  const inlineList = document.querySelector('#bm-template-inline-list');
                  
                  if (templates.length === 0) {
                    inlineList.innerHTML = '<p style="text-align: center; color: #888; margin: 1em 0; font-size: 0.8em;">No templates</p>';
                    return;
                  }
                  
                  inlineList.innerHTML = templates.map(template => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3em; margin: 0.2em 0; background: rgba(0,0,0,0.2); border-radius: 3px; border-left: 2px solid ${template.enabled ? '#4CAF50' : '#f44336'};">
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.8em; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${template.enabled ? '#fff' : '#999'};">${template.name}</div>
                        <div style="font-size: 0.7em; color: #bbb;">${template.coords}</div>
                      </div>
                      <div style="display: flex; gap: 0.2em;">
                        <button onclick="toggleInlineTemplate('${template.key}', ${!template.enabled})" style="width: 25px; height: 25px; font-size: 0.8em; background: ${template.enabled ? '#4CAF50' : '#666'};">${template.enabled ? '👁️' : '👁️‍🗨️'}</button>
                        <button onclick="deleteInlineTemplate('${template.key}', '${template.name}')" style="width: 25px; height: 25px; font-size: 0.8em; background: #d32f2f;">🗑️</button>
                      </div>
                    </div>
                  `).join('');
                };
                
                // Global functions for inline template management
                window.toggleInlineTemplate = async (key, enabled) => {
                  await instance.apiManager?.templateManager?.toggleTemplate(key, enabled);
                  updateInlineList();
                  updateButtonText();
                };
                
                window.deleteInlineTemplate = async (key, name) => {
                  if (confirm(`Delete "${name}"?`)) {
                    await instance.apiManager?.templateManager?.deleteTemplate(key);
                    updateInlineList();
                    updateButtonText();
                  }
                };
                
                updateInlineList();
                button.style.backgroundColor = '#2e97ff';
                button.style.fontWeight = 'bold';
              } else {
                inlineContainer.remove();
                button.style.backgroundColor = '';
                button.style.fontWeight = '';
              }
              return;
            }
            
            // Normal mode - separate window
            templateManagerPanel.style.display = isCurrentlyOpen ? 'none' : 'block';
            
            // Update button appearance based on panel state
            if (!isCurrentlyOpen) {
              refreshTemplateList();
              button.style.backgroundColor = '#2e97ff';
              button.style.fontWeight = 'bold';
            } else {
              button.style.backgroundColor = '';
              button.style.fontWeight = '';
            }
            updateButtonText();
          };
          
          // Update button text immediately and periodically
          updateButtonText();
          setInterval(updateButtonText, 2000);
        }).buildElement()
        .addButton({'id': 'bm-button-enable', 'textContent': 'Enable All'}, (instance, button) => {
          button.onclick = async () => {
            await instance.apiManager?.templateManager?.setAllTemplatesEnabled(true);
            if (window.refreshTemplateList) refreshTemplateList();
            instance.handleDisplayStatus(`Enabled all templates!`);
          }
        }).buildElement()
        .addButton({'id': 'bm-button-create', 'textContent': 'Create'}, (instance, button) => {
          button.onclick = () => {
            const input = document.querySelector('#bm-input-file-template');

            const coordTlX = document.querySelector('#bm-input-tx');
            if (!coordTlX.checkValidity()) {coordTlX.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            const coordTlY = document.querySelector('#bm-input-ty');
            if (!coordTlY.checkValidity()) {coordTlY.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            const coordPxX = document.querySelector('#bm-input-px');
            if (!coordPxX.checkValidity()) {coordPxX.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}
            const coordPxY = document.querySelector('#bm-input-py');
            if (!coordPxY.checkValidity()) {coordPxY.reportValidity(); instance.handleDisplayError('Coordinates are malformed! Did you try clicking on the canvas first?'); return;}

            // Kills itself if there is no file
            if (!input?.files[0]) {instance.handleDisplayError(`No file selected!`); return;}

            templateManager.createTemplate(input.files[0], input.files[0]?.name.replace(/\.[^/.]+$/, ''), [Number(coordTlX.value), Number(coordTlY.value), Number(coordPxX.value), Number(coordPxY.value)]);

            // Refresh template list if manager is open
            setTimeout(() => {
              if (window.refreshTemplateList) refreshTemplateList();
            }, 100); // Small delay to ensure template is fully created

            instance.handleDisplayStatus(`Template created!`);
            
            // Clear the form for easier multi-template creation
            input.value = '';
            const uploadButton = input.parentElement.querySelector('button');
            if (uploadButton) uploadButton.textContent = 'Upload Template';
            
            // Optionally clear coordinates (user might want to keep them for multiple templates at same location)
            // coordTlX.value = '';
            // coordTlY.value = '';
            // coordPxX.value = '';
            // coordPxY.value = '';
          }
        }).buildElement()
        .addButton({'id': 'bm-button-disable', 'textContent': 'Disable All'}, (instance, button) => {
          button.onclick = async () => {
            await instance.apiManager?.templateManager?.setAllTemplatesEnabled(false);
            if (window.refreshTemplateList) refreshTemplateList();
            instance.handleDisplayStatus(`Disabled all templates!`);
          }
        }).buildElement()
      .buildElement()
      .addTextarea({'id': overlayMain.outputStatusId, 'placeholder': `Status: Sleeping...\nVersion: ${version}`, 'readOnly': true}).buildElement()
      .addDiv({'id': 'bm-contain-buttons-action'})
        .addDiv()
          // .addButton({'id': 'bm-button-teleport', 'className': 'bm-help', 'textContent': '✈'}).buildElement()
          // .addButton({'id': 'bm-button-favorite', 'className': 'bm-help', 'innerHTML': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,2 12,7.5 18,7.5 13.5,11.5 15.5,18 10,14 4.5,18 6.5,11.5 2,7.5 8,7.5" fill="white"></polygon></svg>'}).buildElement()
          // .addButton({'id': 'bm-button-templates', 'className': 'bm-help', 'innerHTML': '🖌'}).buildElement()
          .addButton({'id': 'bm-button-convert', 'className': 'bm-help', 'innerHTML': '🎨', 'title': 'Template Color Converter'}, 
            (instance, button) => {
            button.addEventListener('click', () => {
              window.open('https://pepoafonso.github.io/color_converter_wplace/', '_blank', 'noopener noreferrer');
            });
          }).buildElement()
          .addButton({'id': 'bm-button-dark-theme', 'className': 'bm-help', 'innerHTML': '🌙', 'title': 'Toggle dark theme'}, 
            (instance, button) => {
              // Load saved theme state
              const isDarkTheme = GM_getValue('darkTheme', false);
              if (isDarkTheme) {
                document.body.classList.add('bm-dark-theme');
                button.classList.add('active');
              }
              
              button.addEventListener('click', () => {
                const isCurrentlyDark = document.body.classList.contains('bm-dark-theme');
                if (isCurrentlyDark) {
                  document.body.classList.remove('bm-dark-theme');
                  button.classList.remove('active');
                  GM_setValue('darkTheme', false);
                } else {
                  document.body.classList.add('bm-dark-theme');
                  button.classList.add('active');
                  GM_setValue('darkTheme', true);
                }
              });
          }).buildElement()
        .buildElement()
        .addSmall({'textContent': 'Made by SwingTheVine - Modified by Mopi', 'style': 'margin-top: auto;'}).buildElement()
      .buildElement()
    .buildElement()
  .buildOverlay(document.body);
}

function buildTemplateManager() {
  overlayTabTemplate.addDiv({'id': 'bm-template-manager', 'style': 'top: 10px; left: 400px; display: none;'})
    .addDiv({'id': 'bm-template-header'})
      .addDiv({'id': 'bm-template-drag'}).buildElement()
      .addDiv({'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5em;'})
        .addHeader(2, {'textContent': 'Template Manager', 'style': 'margin: 0; color: #fff;'}).buildElement()
        .addButton({'id': 'bm-template-close', 'textContent': '×', 'className': 'bm-help', 'style': 'font-size: large; margin: 0;'}, 
          (instance, button) => {
            button.onclick = () => {
              const manageButton = document.querySelector('#bm-button-manage');
              document.querySelector('#bm-template-manager').style.display = 'none';
              // Reset manage button appearance
              if (manageButton) {
                manageButton.style.backgroundColor = '';
                manageButton.style.fontWeight = '';
              }
            }
          }
        ).buildElement()
      .buildElement()
    .buildElement()

    .addHr({'style': 'margin: 0.5em 0;'}).buildElement()

    .addDiv({'id': 'bm-template-controls', 'style': 'margin-bottom: 1em;'})
      .addButton({'id': 'bm-template-enable-all', 'textContent': 'Enable All'}, (instance, button) => {
        button.onclick = async () => {
          await templateManager.setAllTemplatesEnabled(true);
          refreshTemplateList();
          overlayMain.handleDisplayStatus('All templates enabled!');
        }
      }).buildElement()
      .addButton({'id': 'bm-template-disable-all', 'textContent': 'Disable All'}, (instance, button) => {
        button.onclick = async () => {
          await templateManager.setAllTemplatesEnabled(false);
          refreshTemplateList();
          overlayMain.handleDisplayStatus('All templates disabled!');
        }
      }).buildElement()
    .buildElement()

    .addDiv({'id': 'bm-template-list', 'style': 'max-height: 400px; overflow-y: auto; margin-bottom: 1em;'})
    .buildElement()

    .addHr({'style': 'margin: 0.5em 0;'}).buildElement()

    .addDiv({'id': 'bm-template-stats'})
      .addP({'id': 'bm-template-total-count', 'textContent': 'Total templates: 0', 'style': 'margin: 0.25em 0; font-size: 0.9em;'}).buildElement()
      .addP({'id': 'bm-template-enabled-count', 'textContent': 'Enabled templates: 0', 'style': 'margin: 0.25em 0; font-size: 0.9em;'}).buildElement()
      .addSmall({'textContent': 'Shortcuts: Ctrl+T (toggle), Ctrl+Shift+E (enable all), Ctrl+Shift+D (disable all) • Shift+Click Manage for inline mode', 'style': 'color: #aaa; font-size: 0.7em; margin-top: 0.5em; display: block; line-height: 1.3;'}).buildElement()
    .buildElement()
  .buildOverlay(document.body);

  overlayTabTemplate.handleDrag('#bm-template-manager', '#bm-template-drag');

  // Function to refresh the template list
  window.refreshTemplateList = function() {
    const templates = templateManager.getAllTemplates();
    const templateList = document.querySelector('#bm-template-list');
    const totalCount = document.querySelector('#bm-template-total-count');
    const enabledCount = document.querySelector('#bm-template-enabled-count');
    
    // Clear existing list
    templateList.innerHTML = '';
    
    // Update statistics
    const enabledTemplates = templates.filter(t => t.enabled);
    totalCount.textContent = `Total templates: ${templates.length}`;
    enabledCount.textContent = `Enabled templates: ${enabledTemplates.length}`;
    
    if (templates.length === 0) {
      templateList.innerHTML = '<div style="text-align: center; color: #888; margin: 2em 0; padding: 1em; background-color: rgba(0,0,0,0.1); border-radius: 4px; font-style: italic;">No templates loaded<br><small>Create templates using the main interface</small></div>';
      return;
    }
    
    // Create template items
    templates.forEach(template => {
      const templateItem = document.createElement('div');
      templateItem.className = 'bm-template-item';
      templateItem.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75em;
        margin: 0.5em 0;
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 6px;
        border-left: 4px solid ${template.enabled ? '#4CAF50' : '#f44336'};
        transition: all 0.2s ease;
        min-height: 60px;
      `;
      
      const templateInfo = document.createElement('div');
      templateInfo.style.cssText = 'flex: 1; min-width: 0; margin-right: 1em;';
      
      const templateName = document.createElement('div');
      templateName.textContent = template.name;
      templateName.style.cssText = `
        font-weight: bold;
        margin-bottom: 0.4em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: ${template.enabled ? '#fff' : '#999'};
        font-size: 1em;
      `;
      
      const templateDetails = document.createElement('div');
      templateDetails.style.cssText = 'font-size: 0.8em; color: #bbb; line-height: 1.3;';
      const pixelCountFormatted = new Intl.NumberFormat().format(template.pixelCount);
      templateDetails.innerHTML = `
        <div>📍 ${template.coords}</div>
        <div>🎨 ${pixelCountFormatted} pixels</div>
      `;
      
      templateInfo.appendChild(templateName);
      templateInfo.appendChild(templateDetails);
      
      const templateActions = document.createElement('div');
      templateActions.style.cssText = 'display: flex; flex-direction: column; gap: 0.3em; align-items: center;';
      
      // Info button
      const infoBtn = document.createElement('button');
      infoBtn.textContent = 'ℹ️';
      infoBtn.title = 'Template information';
      infoBtn.className = 'bm-help';
      infoBtn.style.cssText = `
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1em;
        background-color: #2196F3;
      `;
      infoBtn.onclick = () => {
        showTemplateInfo(template);
      };
      
      // Toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = template.enabled ? '👁️' : '👁️‍🗨️';
      toggleBtn.title = template.enabled ? 'Hide template' : 'Show template';
      toggleBtn.className = 'bm-help';
      toggleBtn.style.cssText = `
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2em;
        background-color: ${template.enabled ? '#4CAF50' : '#666'};
      `;
      toggleBtn.onclick = async () => {
        await templateManager.toggleTemplate(template.key, !template.enabled);
        refreshTemplateList();
        overlayMain.handleDisplayStatus(`Template "${template.name}" ${!template.enabled ? 'enabled' : 'disabled'}`);
      };
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'Delete template';
      deleteBtn.className = 'bm-help';
      deleteBtn.style.cssText = `
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1em;
        background-color: #d32f2f;
      `;
      deleteBtn.onclick = async () => {
        if (confirm(`Are you sure you want to delete "${template.name}"?\n\nThis action cannot be undone.`)) {
          await templateManager.deleteTemplate(template.key);
          refreshTemplateList();
          overlayMain.handleDisplayStatus(`Template "${template.name}" deleted`);
        }
      };
      
      templateActions.appendChild(infoBtn);
      templateActions.appendChild(toggleBtn);
      templateActions.appendChild(deleteBtn);
      
      templateItem.appendChild(templateInfo);
      templateItem.appendChild(templateActions);
      templateList.appendChild(templateItem);
    });
  };

  // Function to show detailed template information
  window.showTemplateInfo = async function(template) {
    // Create modal if it doesn't exist
    let modal = document.querySelector('#bm-template-info');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bm-template-info';
      modal.style.cssText = 'top: 50%; left: 50%; transform: translate(-50%, -50%); display: none;';
      document.body.appendChild(modal);
    }

    // Get template instance for detailed analysis
    const templateInstance = templateManager.templatesArray.find(t => `${t.sortID} ${t.authorID}` === template.key);
    
    modal.innerHTML = `
      <div class="info-header">
        <h2 style="margin: 0; color: #fff;">Template Information</h2>
        <button id="bm-info-close" class="bm-help" style="width: 30px; height: 30px; background: #d32f2f; font-size: 1.2em;">×</button>
      </div>
      
      <div class="info-section">
        <h4>📋 Basic Information</h4>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.5em 1em; font-size: 0.9em;">
          <strong>Name:</strong> 
          <div style="display: flex; gap: 0.5em; align-items: center;">
            <span id="bm-info-name-display">${template.name}</span>
            <button id="bm-info-name-edit" class="bm-help" style="width: 25px; height: 25px; background: #2196F3; font-size: 0.8em;">✏️</button>
          </div>
          <strong>Coordinates:</strong> 
          <div style="display: flex; gap: 0.5em; align-items: center;">
            <span id="bm-info-coords-display">${template.coords}</span>
            <button id="bm-info-coords-edit" class="bm-help" style="width: 25px; height: 25px; background: #2196F3; font-size: 0.8em;">✏️</button>
          </div>
          <strong>Status:</strong> <span style="color: ${template.enabled ? '#4CAF50' : '#f44336'};">${template.enabled ? 'Enabled' : 'Disabled'}</span>
          <strong>Template ID:</strong> <span>${template.key}</span>
        </div>
        <div id="bm-info-name-editor" style="display: none; margin-top: 1em; padding: 1em; background: rgba(0,0,0,0.3); border-radius: 4px;">
          <div style="margin-bottom: 0.5em; font-weight: bold;">Edit Template Name:</div>
          <div style="display: flex; gap: 0.5em; align-items: center;">
            <input type="text" id="bm-name-input" value="${template.name}" style="flex: 1; padding: 0.3em; background: #333; border: 1px solid #666; color: white; border-radius: 3px;">
            <button id="bm-name-save" style="padding: 0.3em 0.6em; background: #4CAF50; border: none; color: white; border-radius: 3px; cursor: pointer;">Save</button>
            <button id="bm-name-cancel" style="padding: 0.3em 0.6em; background: #666; border: none; color: white; border-radius: 3px; cursor: pointer;">Cancel</button>
          </div>
        </div>
        <div id="bm-info-coords-editor" style="display: none; margin-top: 1em; padding: 1em; background: rgba(0,0,0,0.3); border-radius: 4px;">
          <div style="margin-bottom: 0.5em; font-weight: bold;">Edit Coordinates:</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5em; margin-bottom: 0.5em;">
            <input type="number" id="bm-coord-tile-x" placeholder="Tile X" min="0" max="2047" style="padding: 0.3em; background: #333; border: 1px solid #666; color: white; border-radius: 3px;">
            <input type="number" id="bm-coord-tile-y" placeholder="Tile Y" min="0" max="2047" style="padding: 0.3em; background: #333; border: 1px solid #666; color: white; border-radius: 3px;">
            <input type="number" id="bm-coord-pixel-x" placeholder="Pixel X" min="0" max="999" style="padding: 0.3em; background: #333; border: 1px solid #666; color: white; border-radius: 3px;">
            <input type="number" id="bm-coord-pixel-y" placeholder="Pixel Y" min="0" max="999" style="padding: 0.3em; background: #333; border: 1px solid #666; color: white; border-radius: 3px;">
          </div>
          <div style="display: flex; gap: 0.5em;">
            <button id="bm-coords-save" style="flex: 1; padding: 0.5em; background: #4CAF50; border: none; color: white; border-radius: 3px; cursor: pointer;">Save</button>
            <button id="bm-coords-cancel" style="flex: 1; padding: 0.5em; background: #666; border: none; color: white; border-radius: 3px; cursor: pointer;">Cancel</button>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>📊 Statistics</h4>
        <div class="info-stats">
          <div class="stat-item">
            <div class="stat-value">${new Intl.NumberFormat().format(template.pixelCount)}</div>
            <div class="stat-label">Total Pixels</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="bm-info-tiles">Loading...</div>
            <div class="stat-label">Tiles Used</div>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>🎨 Template Preview</h4>
        <div class="info-preview">
          <div id="bm-info-preview-content">Generating preview...</div>
        </div>
      </div>

      <div class="info-section">
        <h4>🌈 Color Analysis</h4>
        <div id="bm-info-colors">Analyzing colors...</div>
      </div>
    `;

    // Show modal
    modal.style.display = 'block';

    // Close button functionality
    document.getElementById('bm-info-close').onclick = () => {
      modal.style.display = 'none';
    };

    // Coordinate editing functionality
    const coordsEditBtn = document.getElementById('bm-info-coords-edit');
    const coordsEditor = document.getElementById('bm-info-coords-editor');
    const coordsDisplay = document.getElementById('bm-info-coords-display');
    const coordInputs = {
      tileX: document.getElementById('bm-coord-tile-x'),
      tileY: document.getElementById('bm-coord-tile-y'),
      pixelX: document.getElementById('bm-coord-pixel-x'),
      pixelY: document.getElementById('bm-coord-pixel-y')
    };

    // Parse current coordinates for editing
    const currentCoords = template.coords.split(',').map(s => parseInt(s.trim()));
    
    coordsEditBtn.onclick = () => {
      // Populate input fields with current coordinates
      coordInputs.tileX.value = currentCoords[0] || '';
      coordInputs.tileY.value = currentCoords[1] || '';
      coordInputs.pixelX.value = currentCoords[2] || '';
      coordInputs.pixelY.value = currentCoords[3] || '';
      
      // Show editor, hide display
      coordsEditor.style.display = 'block';
      coordsEditBtn.style.display = 'none';
    };

    document.getElementById('bm-coords-cancel').onclick = () => {
      // Hide editor, show display
      coordsEditor.style.display = 'none';
      coordsEditBtn.style.display = 'inline-block';
    };

    document.getElementById('bm-coords-save').onclick = async () => {
      try {
        // Validate and collect new coordinates
        const newCoords = [
          parseInt(coordInputs.tileX.value),
          parseInt(coordInputs.tileY.value),
          parseInt(coordInputs.pixelX.value),
          parseInt(coordInputs.pixelY.value)
        ];

        // Validate coordinates
        if (newCoords.some(coord => isNaN(coord) || coord < 0)) {
          throw new Error('All coordinates must be non-negative numbers');
        }

        if (newCoords[0] > 2047 || newCoords[1] > 2047) {
          throw new Error('Tile coordinates must be between 0-2047');
        }

        if (newCoords[2] > 999 || newCoords[3] > 999) {
          throw new Error('Pixel coordinates must be between 0-999');
        }

        // Update coordinates using template manager
        const result = await templateManager.updateTemplateCoordinates(template.key, newCoords);
        
        // Update display
        const newCoordsString = newCoords.join(', ');
        coordsDisplay.textContent = newCoordsString;
        template.coords = newCoordsString; // Update local template object
        
        // Hide editor, show display
        coordsEditor.style.display = 'none';
        coordsEditBtn.style.display = 'inline-block';
        
        // Refresh template list to show updated coordinates
        if (window.refreshTemplateList) {
          refreshTemplateList();
        }
        
        // Show success message
        overlayMain.handleDisplayStatus(result);
        
      } catch (error) {
        alert(`Failed to update coordinates: ${error.message}`);
        console.error('Coordinate update error:', error);
      }
    };

    // Name editing functionality
    const nameEditBtn = document.getElementById('bm-info-name-edit');
    const nameEditor = document.getElementById('bm-info-name-editor');
    const nameDisplay = document.getElementById('bm-info-name-display');
    const nameInput = document.getElementById('bm-name-input');

    nameEditBtn.onclick = () => {
      // Populate input field with current name
      nameInput.value = template.name;
      
      // Show editor, hide display
      nameEditor.style.display = 'block';
      nameEditBtn.style.display = 'none';
    };

    document.getElementById('bm-name-cancel').onclick = () => {
      // Hide editor, show display
      nameEditor.style.display = 'none';
      nameEditBtn.style.display = 'inline-block';
    };

    document.getElementById('bm-name-save').onclick = async () => {
      try {
        const newName = nameInput.value.trim();
        
        // Validate name
        if (!newName) {
          throw new Error('Template name cannot be empty');
        }

        if (newName.length > 100) {
          throw new Error('Template name must be 100 characters or less');
        }

        // Update name using template manager
        await templateManager.updateTemplateName(template.key, newName);
        
        // Update display
        nameDisplay.textContent = newName;
        template.name = newName; // Update local template object
        
        // Hide editor, show display
        nameEditor.style.display = 'none';
        nameEditBtn.style.display = 'inline-block';
        
        // Refresh template list to show updated name
        if (window.refreshTemplateList) {
          refreshTemplateList();
        }
        
        // Show success message
        overlayMain.handleDisplayStatus(`Template renamed to "${newName}"`);
        
      } catch (error) {
        alert(`Failed to update name: ${error.message}`);
        console.error('Name update error:', error);
      }
    };

    // Load detailed information asynchronously
    if (templateInstance && templateInstance.chunked) {
      // Update tile count
      const tileCount = Object.keys(templateInstance.chunked).length;
      document.getElementById('bm-info-tiles').textContent = tileCount;

      // Generate preview and color analysis
      try {
        const { preview, colorAnalysis } = await analyzeTemplate(templateInstance);
        
        // Update preview
        const previewContent = document.getElementById('bm-info-preview-content');
        if (preview) {
          previewContent.innerHTML = '';
          previewContent.appendChild(preview);
        } else {
          previewContent.textContent = 'Preview not available';
        }

        // Update color analysis
        const colorsContent = document.getElementById('bm-info-colors');
        if (colorAnalysis && colorAnalysis.length > 0) {
          const totalPixels = colorAnalysis.reduce((sum, c) => sum + c.count, 0);
          colorsContent.innerHTML = `
            <div style="margin-bottom: 0.5em; font-size: 0.9em;">
              <strong>Unique Colors:</strong> ${colorAnalysis.length} | 
              <strong>Analyzed Pixels:</strong> ${new Intl.NumberFormat().format(totalPixels)}
            </div>
            <div class="color-grid">
              ${colorAnalysis.map(color => `
                <div class="color-item">
                  <div class="color-swatch" style="background-color: ${color.hex};"></div>
                  <div class="color-info">
                    <div style="font-weight: bold;">${color.hex}</div>
                    <div>${color.count} px (${color.percentage}%)</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        } else {
          colorsContent.textContent = 'No color data available';
        }
      } catch (e) {
        console.error('Failed to analyze template:', e);
        document.getElementById('bm-info-preview-content').textContent = 'Analysis failed';
        document.getElementById('bm-info-colors').textContent = 'Color analysis failed';
      }
    }
  };

  // Function to analyze template colors and generate preview
  async function analyzeTemplate(templateInstance) {
    if (!templateInstance.chunked) return { preview: null, colorAnalysis: [] };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const colorCounts = new Map();
    let totalPixels = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // First pass: determine bounds and analyze colors
    for (const [tileKey, bitmap] of Object.entries(templateInstance.chunked)) {
      const [tileX, tileY, pixelX, pixelY] = tileKey.split(',').map(Number);
      
      // Update bounds
      minX = Math.min(minX, parseInt(pixelX));
      minY = Math.min(minY, parseInt(pixelY));
      maxX = Math.max(maxX, parseInt(pixelX) + bitmap.width / 3);
      maxY = Math.max(maxY, parseInt(pixelY) + bitmap.height / 3);

      // Analyze colors from the bitmap
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = bitmap.width;
      tempCanvas.height = bitmap.height;
      tempCtx.drawImage(bitmap, 0, 0);
      
      const imageData = tempCtx.getImageData(0, 0, bitmap.width, bitmap.height);
      const data = imageData.data;

      // Sample every 3x3 center pixel (where actual pixel data is stored)
      for (let y = 1; y < bitmap.height; y += 3) {
        for (let x = 1; x < bitmap.width; x += 3) {
          const idx = (y * bitmap.width + x) * 4;
          const alpha = data[idx + 3];
          
          if (alpha > 0) {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            
            colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
            totalPixels++;
          }
        }
      }
    }

    // Generate preview canvas
    let preview = null;
    if (minX !== Infinity) {
      const previewWidth = Math.min(400, maxX - minX);
      const previewHeight = Math.min(300, maxY - minY);
      const scale = Math.min(previewWidth / (maxX - minX), previewHeight / (maxY - minY));
      
      canvas.width = (maxX - minX) * scale;
      canvas.height = (maxY - minY) * scale;
      ctx.imageSmoothingEnabled = false;
      
      // Draw all tiles to preview
      for (const [tileKey, bitmap] of Object.entries(templateInstance.chunked)) {
        const [tileX, tileY, pixelX, pixelY] = tileKey.split(',').map(Number);
        const drawX = (parseInt(pixelX) - minX) * scale;
        const drawY = (parseInt(pixelY) - minY) * scale;
        const drawWidth = (bitmap.width / 3) * scale;
        const drawHeight = (bitmap.height / 3) * scale;
        
        ctx.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);
      }
      
      preview = canvas;
    }

    // Process color analysis
    const colorAnalysis = Array.from(colorCounts.entries())
      .map(([hex, count]) => ({
        hex,
        count,
        percentage: ((count / totalPixels) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 colors

    return { preview, colorAnalysis };
  }
}