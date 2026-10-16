pkgname=flip
pkgver=0.1.0
pkgrel=1
pkgdesc="Comic and image viewer"
arch=('any')
depends=('electron')

package() {
  install -d "$pkgdir/usr/lib/flip-electron"
  cp -r "$startdir"/main.js "$startdir"/preload.js "$startdir"/renderer "$startdir"/package.json \
    "$pkgdir/usr/lib/flip-electron/"
  install -Dm755 "$startdir"/flip "$pkgdir/usr/bin/flip"
  install -Dm644 "$startdir"/config.example "$pkgdir/usr/share/flip/config.example"
  install -Dm644 "$startdir"/flip.desktop "$pkgdir/usr/share/applications/flip.desktop"
  install -Dm644 "$startdir"/flip.svg "$pkgdir/usr/share/icons/hicolor/scalable/apps/flip.svg"
}
