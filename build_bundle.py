import os
import json

def build():
    print("Building vetrx_standalone_final.html...")
    
    with open('index.html', 'r') as f:
        html = f.read()

    # Inline CSS
    with open('styles/main.css', 'r') as f:
        css = f.read()
    html = html.replace('<link rel="stylesheet" href="styles/main.css" />', f'<style>{css}</style>')

    # Inline Catalog
    with open('data/drug_catalog.json', 'r') as f:
        catalog_json = f.read()
    catalog_script = f'<script id="inlined-drug-catalog-json">window.VETRX_CATALOG_DATA = {catalog_json};</script>'
    html = html.replace('<script>\n    // Load catalog into window.VETRX_CATALOG_DATA\n    async function loadCatalog() {\n      const response = await fetch(\'data/drug_catalog.json\');\n      window.VETRX_CATALOG_DATA = await response.json();\n    }\n  </script>', catalog_script)

    # Inline JS Modules
    js_modules = [
        ('src/dose_engine.js', 'inlined-dose-engine'),
        ('src/crypto_storage.js', 'inlined-crypto-storage'),
        ('src/i18n.js', 'inlined-i18n'),
        ('src/app_controller.js', 'inlined-app-controller')
    ]

    for file_path, script_id in js_modules:
        with open(file_path, 'r') as f:
            code = f.read()
        html = html.replace(f'<script src="{file_path}"></script>', f'<script id="{script_id}">{code}</script>')

    # Handle QR CDN and Fallback
    # The user wants an offline fallback. I will add a script that checks for qrcode and provides a fallback.
    qr_fallback = """
<script>
if (typeof qrcode === 'undefined') {
    console.warn('QR Code Library offline. Using Fallback SHA-256 Text Badge.');
    window.generateSvgQrCode = function(text) {
        return '<div class="p-4 border-2 border-slate-300 bg-slate-100 text-slate-800 font-mono text-[10px] break-all">OFFLINE QR FALLBACK: ' + text + '</div>';
    };
}
</script>
"""
    html = html.replace('</body>', f'{qr_fallback}</body>')

    # Remove the async bootstrap and replace with sync if needed
    # In index.html I added:
    # <script>
    #   // Bootstrap the app after catalog is loaded
    #   (async () => {
    #     await loadCatalog();
    #   })();
    # </script>
    # Since it is now inlined, I can remove this.
    bootstrap_snippet = """  <script>
    // Bootstrap the app after catalog is loaded
    (async () => {
      await loadCatalog();
      // app_controller initialization is handled by DOMContentLoaded in the file
      // but since we fetch the catalog async, we might need to trigger it manually 
      // or ensure app_controller waits for VETRX_CATALOG_DATA.
      // Looking at app_controller, it uses window.VETRX_CATALOG_DATA in DOMContentLoaded.
    })();
  </script>"""
    html = html.replace(bootstrap_snippet, "")

    with open('vetrx_standalone_final.html', 'w') as f:
        f.write(html)
    
    print("Build complete: vetrx_standalone_final.html")

if __name__ == "__main__":
    build()
