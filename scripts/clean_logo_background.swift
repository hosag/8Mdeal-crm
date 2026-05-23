import AppKit
import CoreGraphics
import Foundation

func clamp(_ value: Int, min minValue: Int = 0, max maxValue: Int = 255) -> UInt8 {
  return UInt8(Swift.max(minValue, Swift.min(maxValue, value)))
}

guard CommandLine.arguments.count >= 3 else {
  fputs("usage: clean_logo_background.swift <input> <output>\n", stderr)
  exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard
  let image = NSImage(contentsOfFile: inputPath),
  let tiffData = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiffData),
  let cgImage = bitmap.cgImage
else {
  fputs("failed to load input image\n", stderr)
  exit(1)
}

let width = cgImage.width
let height = cgImage.height
let bytesPerPixel = 4
let bitsPerComponent = 8
let bytesPerRow = width * bytesPerPixel

guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
  fputs("failed to create color space\n", stderr)
  exit(1)
}

guard
  let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: bitsPerComponent,
    bytesPerRow: bytesPerRow,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  )
else {
  fputs("failed to create context\n", stderr)
  exit(1)
}

context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

guard let data = context.data else {
  fputs("failed to access pixel data\n", stderr)
  exit(1)
}

let pixels = data.bindMemory(to: UInt8.self, capacity: width * height * bytesPerPixel)

for offset in stride(from: 0, to: width * height * bytesPerPixel, by: bytesPerPixel) {
  let red = Int(pixels[offset + 0])
  let green = Int(pixels[offset + 1])
  let blue = Int(pixels[offset + 2])
  let alpha = Int(pixels[offset + 3])

  if alpha == 0 {
    continue
  }

  let maxChannel = Swift.max(red, green, blue)
  let minChannel = Swift.min(red, green, blue)
  let average = (red + green + blue) / 3
  let isLightNeutral = (maxChannel - minChannel) <= 18 && average >= 180

  if isLightNeutral {
    pixels[offset + 0] = 0
    pixels[offset + 1] = 0
    pixels[offset + 2] = 0
    pixels[offset + 3] = 0
  }
}

var minX = width
var minY = height
var maxX = -1
var maxY = -1

for y in 0..<height {
  for x in 0..<width {
    let offset = (y * width + x) * bytesPerPixel
    let alpha = Int(pixels[offset + 3])
    if alpha <= 8 {
      continue
    }
    if x < minX { minX = x }
    if y < minY { minY = y }
    if x > maxX { maxX = x }
    if y > maxY { maxY = y }
  }
}

guard maxX >= minX && maxY >= minY else {
  fputs("image became fully transparent\n", stderr)
  exit(1)
}

let padding = 8
minX = Swift.max(0, minX - padding)
minY = Swift.max(0, minY - padding)
maxX = Swift.min(width - 1, maxX + padding)
maxY = Swift.min(height - 1, maxY + padding)

let cropWidth = maxX - minX + 1
let cropHeight = maxY - minY + 1

guard let croppedCgImage = context.makeImage()?.cropping(to: CGRect(x: minX, y: minY, width: cropWidth, height: cropHeight)) else {
  fputs("failed to crop output image\n", stderr)
  exit(1)
}

let outputRep = NSBitmapImageRep(cgImage: croppedCgImage)
guard let pngData = outputRep.representation(using: .png, properties: [:]) else {
  fputs("failed to encode output png\n", stderr)
  exit(1)
}

do {
  try pngData.write(to: URL(fileURLWithPath: outputPath))
} catch {
  fputs("failed to write output image\n", stderr)
  exit(1)
}
