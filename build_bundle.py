import os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(rel):
    with open(os.path.join(ROOT, rel), 'r', encoding='utf-8') as f:
        return f.read()

def build():
    print('Building vetrx_standalone_final.html...')
    html = read('index.html')

    # Inline CSS
    css = read('styles/main.css')
    html = html.replace('<link rel="stylesheet" href="styles/main.css" />', f'<style>\n{css}\n</style>', 1)

    # Remove manifest link for standalone bundle? keep is fine but optional; leave as-is.
    # Inline browser catalog data
    catalog_js = read('data/drug_catalog_browser.js')
    html = html.replace('<script src="data/drug_catalog_browser.js"></script>',
                        f'<script id="inlined-drug-catalog-browser">\n{catalog_js}\n</script>', 1)

    # Inline JS modules in order
    replacements = [
        ('<script src="src/dose_engine.js"></script>', 'inlined-dose-engine', 'src/dose_engine.js'),
        ('<script src="src/crypto_storage.js"></script>', 'inlined-crypto-storage', 'src/crypto_storage.js'),
        ('<script src="src/i18n.js"></script>', 'inlined-i18n', 'src/i18n.js'),
        ('<script src="src/app_controller.js"></script>', 'inlined-app-controller', 'src/app_controller.js'),
    ]
    for tag, sid, path in replacements:
        js = read(path)
        html = html.replace(tag, f'<script id="{sid}">\n{js}\n</script>', 1)

    out = os.path.join(ROOT, 'vetrx_standalone_final.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Build complete: {out}')

if __name__ == '__main__':
    build()
