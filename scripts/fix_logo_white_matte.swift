import AppKit
import CoreGraphics
import Foundation

func clamp(_ value: Double, min minValue: Double = 0.0, max maxValue: Double = 255.0) -> UInt8 {
  if value < minValue { return UInt8(minValue) }
  if value > maxValue { return UInt8(maxValue) }
  return UInt8(value.rounded())
}

guard CommandLine.arguments.count >= 3 else {
  fputs("usage: fix_logo_white_matte.swift <input> <output>\n", stderr)
  exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard
  let image = NSImage(contentsOfFile: inputPath),
  let tiffData = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiffData)
else {
  fputs("failed to load input image\n", stderr)
  exit(1)
}

let width = bitmap.pixelsWide
let height = bitmap.pixelsHigh
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

let rect = CGRect(x: 0, y: 0, width: width, height: height)
guard let cgImage = bitmap.cgImage else {
  fputs("failed to create cgImage\n", stderr)
  exit(1)
}

context.draw(cgImage, in: rect)

guard let data = context.data else {
  fputs("failed to access pixel data\n", stderr)
  exit(1)
}

let pixels = data.bindMemory(to: UInt8.self, capacity: width * height * bytesPerPixel)

for offset in stride(from: 0, to: width * height * bytesPerPixel, by: bytesPerPixel) {
  let alpha = Double(pixels[offset + 3]) / 255.0
  if alpha <= 0.0 {
    continue
  }

  let red = Double(pixels[offset + 0])
  let green = Double(pixels[offset + 1])
  let blue = Double(pixels[offset + 2])

  // Remove the white matte introduced during export so edges stay clean on dark backgrounds.
  let fixedRed = (red - (1.0 - alpha) * 255.0) / alpha
  let fixedGreen = (green - (1.0 - alpha) * 255.0) / alpha
  let fixedBlue = (blue - (1.0 - alpha) * 255.0) / alpha

  pixels[offset + 0] = clamp(fixedRed)
  pixels[offset + 1] = clamp(fixedGreen)
  pixels[offset + 2] = clamp(fixedBlue)
}

guard let outputCgImage = context.makeImage() else {
  fputs("failed to create output image\n", stderr)
  exit(1)
}

let outputRep = NSBitmapImageRep(cgImage: outputCgImage)
guard let pngData = outputRep.representation(using: .png, properties: [:]) else {
  fputs("failed to encode png\n", stderr)
  exit(1)
}

do {
  try pngData.write(to: URL(fileURLWithPath: outputPath))
} catch {
  fputs("failed to write output image\n", stderr)
  exit(1)
}
