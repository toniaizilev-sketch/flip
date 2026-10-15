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
}
