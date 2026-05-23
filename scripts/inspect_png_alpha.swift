import AppKit
import Foundation

guard CommandLine.arguments.count >= 2 else {
  fputs("usage: inspect_png_alpha.swift <image>\n", stderr)
  exit(1)
}

let path = CommandLine.arguments[1]

guard
  let image = NSImage(contentsOfFile: path),
  let tiffData = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiffData)
else {
  fputs("failed to load image\n", stderr)
  exit(1)
}

let width = bitmap.pixelsWide
let height = bitmap.pixelsHigh
let points = [
  (0, 0),
  (1, 1),
  (width / 2, 0),
  (0, height / 2),
  (width - 1, height - 1),
  (width / 2, height / 2)
]

for (x, y) in points {
  if let color = bitmap.colorAt(x: x, y: y) {
    let red = Int((color.redComponent * 255.0).rounded())
    let green = Int((color.greenComponent * 255.0).rounded())
    let blue = Int((color.blueComponent * 255.0).rounded())
    let alpha = Int((color.alphaComponent * 255.0).rounded())
    print("\(x),\(y): \(red),\(green),\(blue),\(alpha)")
  } else {
    print("\(x),\(y): nil")
  }
}
