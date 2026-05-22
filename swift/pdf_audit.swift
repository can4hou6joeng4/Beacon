import Foundation
import PDFKit
import Vision
import AppKit

struct Manifest: Codable {
    let pageCount: Int
    let outlineCount: Int
    let items: [ManifestItem]
    let pages: [Int]
}

struct ManifestItem: Codable {
    let personIndex: Int?
    let person: String
    let bookmark: String
    let startPage: Int
    let endPage: Int
}

struct OutlineNode {
    let depth: Int
    let page: Int
    let title: String
}

struct PersonContext {
    let depth: Int
    let index: Int?
    let name: String
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("usage: pdf_audit.swift <pdf> <output-dir> [scale]\n", stderr)
    exit(2)
}

let pdfURL = URL(fileURLWithPath: args[1])
let outputDir = URL(fileURLWithPath: args[2], isDirectory: true)
let scale = args.count >= 4 ? (Double(args[3]) ?? 2.0) : 2.0

try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

guard let doc = PDFDocument(url: pdfURL) else {
    fputs("failed to open PDF\n", stderr)
    exit(1)
}

func outlineTitle(_ outline: PDFOutline) -> String {
    outline.label ?? outline.destination?.page?.label ?? ""
}

func outlinePage(_ outline: PDFOutline) -> Int? {
    if let page = outline.destination?.page {
        let idx = doc.index(for: page)
        if idx >= 0 { return idx + 1 }
    }
    if let action = outline.action as? PDFActionGoTo, let page = action.destination.page {
        let idx = doc.index(for: page)
        if idx >= 0 { return idx + 1 }
    }
    return nil
}

func walk(_ outline: PDFOutline, depth: Int, into nodes: inout [OutlineNode]) {
    nodes.append(OutlineNode(depth: depth, page: outlinePage(outline) ?? -1, title: outlineTitle(outline)))
    for i in 0..<outline.numberOfChildren {
        if let child = outline.child(at: i) {
            walk(child, depth: depth + 1, into: &nodes)
        }
    }
}

func parsePerson(_ title: String) -> (Int?, String)? {
    let pattern = #"^(?:\((\d+)\)|([0-9]+)[\.．、])(.+)$"#
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: title, range: NSRange(title.startIndex..., in: title)),
          let nameRange = Range(match.range(at: 3), in: title) else {
        return nil
    }

    let index: Int?
    if let parenthesizedRange = Range(match.range(at: 1), in: title) {
        index = Int(title[parenthesizedRange])
    } else if let dottedRange = Range(match.range(at: 2), in: title) {
        index = Int(title[dottedRange])
    } else {
        index = nil
    }

    let rawName = String(title[nameRange])
    let separators = ["-", "－", "—"]
    let name = separators.reduce(rawName) { partial, separator in
        partial.components(separatedBy: separator).last ?? partial
    }
    return (index, name.trimmingCharacters(in: .whitespacesAndNewlines))
}

func isCertificateBookmark(_ title: String) -> Bool {
    let keywords = ["注册造价", "注册信息", "执业注册", "身份证", "资格证", "职称证", "学历证书", "社保"]
    return keywords.contains { title.contains($0) }
}

func shouldScanHeader(for pageNo: Int, manifest: Manifest) -> Bool {
    manifest.items.contains { item in
        item.startPage <= pageNo &&
        pageNo <= item.endPage &&
        item.bookmark.contains("注册造价")
    }
}

func buildManifest(from outlines: [OutlineNode]) -> Manifest {
    var people: [PersonContext] = []
    var items: [ManifestItem] = []

    for (idx, node) in outlines.enumerated() {
        while let last = people.last, last.depth >= node.depth {
            people.removeLast()
        }
        if let parsed = parsePerson(node.title) {
            people.append(PersonContext(depth: node.depth, index: parsed.0, name: parsed.1))
            continue
        }

        guard let person = people.last, node.depth > person.depth, isCertificateBookmark(node.title), node.page > 0 else { continue }
        var nextPage: Int? = nil
        for next in outlines[(idx + 1)...] {
            if next.depth <= node.depth, next.page > 0 {
                nextPage = next.page
                break
            }
        }
        let start = node.page
        let end = max(start, min(doc.pageCount, (nextPage ?? (start + 1)) - 1))
        items.append(ManifestItem(personIndex: person.index, person: person.name, bookmark: node.title, startPage: start, endPage: end))
    }

    let pages = Array(Set(items.flatMap { Array($0.startPage...$0.endPage) })).sorted()
    return Manifest(pageCount: doc.pageCount, outlineCount: outlines.count, items: items, pages: pages)
}

func render(_ page: PDFPage, scale: Double) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)
    guard width > 0, height > 0 else { return nil }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(data: nil,
                              width: width,
                              height: height,
                              bitsPerComponent: 8,
                              bytesPerRow: 0,
                              space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.saveGState()
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    ctx.restoreGState()
    return ctx.makeImage()
}

func renderPNG(_ page: PDFPage, scale: Double, to url: URL) throws {
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)
    guard width > 0, height > 0 else {
        throw NSError(domain: "PDFAuditRender", code: 1, userInfo: [NSLocalizedDescriptionKey: "invalid page size"])
    }
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                     pixelsWide: width,
                                     pixelsHigh: height,
                                     bitsPerSample: 8,
                                     samplesPerPixel: 4,
                                     hasAlpha: true,
                                     isPlanar: false,
                                     colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0,
                                     bitsPerPixel: 0) else {
        throw NSError(domain: "PDFAuditRender", code: 2, userInfo: [NSLocalizedDescriptionKey: "failed to create bitmap"])
    }
    guard let graphics = NSGraphicsContext(bitmapImageRep: rep) else {
        throw NSError(domain: "PDFAuditRender", code: 3, userInfo: [NSLocalizedDescriptionKey: "failed to create graphics context"])
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    graphics.cgContext.setFillColor(NSColor.white.cgColor)
    graphics.cgContext.fill(CGRect(x: 0, y: 0, width: width, height: height))
    graphics.cgContext.saveGState()
    graphics.cgContext.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: graphics.cgContext)
    graphics.cgContext.restoreGState()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "PDFAuditRender", code: 4, userInfo: [NSLocalizedDescriptionKey: "failed to encode png"])
    }
    try data.write(to: url)
}

func renderRegionPNG(_ page: PDFPage, crop: CGRect, scale: Double, to url: URL) throws {
    let width = Int(crop.width * scale)
    let height = Int(crop.height * scale)
    guard width > 0, height > 0 else {
        throw NSError(domain: "PDFAuditRender", code: 6, userInfo: [NSLocalizedDescriptionKey: "invalid crop size"])
    }
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                     pixelsWide: width,
                                     pixelsHigh: height,
                                     bitsPerSample: 8,
                                     samplesPerPixel: 4,
                                     hasAlpha: true,
                                     isPlanar: false,
                                     colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0,
                                     bitsPerPixel: 0) else {
        throw NSError(domain: "PDFAuditRender", code: 7, userInfo: [NSLocalizedDescriptionKey: "failed to create crop bitmap"])
    }
    guard let graphics = NSGraphicsContext(bitmapImageRep: rep) else {
        throw NSError(domain: "PDFAuditRender", code: 8, userInfo: [NSLocalizedDescriptionKey: "failed to create crop graphics context"])
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    graphics.cgContext.setFillColor(NSColor.white.cgColor)
    graphics.cgContext.fill(CGRect(x: 0, y: 0, width: width, height: height))
    graphics.cgContext.saveGState()
    graphics.cgContext.scaleBy(x: scale, y: scale)
    graphics.cgContext.translateBy(x: -crop.minX, y: -crop.minY)
    page.draw(with: .mediaBox, to: graphics.cgContext)
    graphics.cgContext.restoreGState()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "PDFAuditRender", code: 9, userInfo: [NSLocalizedDescriptionKey: "failed to encode crop png"])
    }
    try data.write(to: url)
}

func recognize(_ image: CGImage) throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.006
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}

func tesseractPath() throws -> String {
    let candidates = [
        ProcessInfo.processInfo.environment["PDF_AUDIT_TESSERACT_PATH"],
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
    ].compactMap { $0 }
    guard let tesseractPath = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
        throw NSError(domain: "PDFAuditTesseract",
                      code: 127,
                      userInfo: [NSLocalizedDescriptionKey: "tesseract executable not found"])
    }
    return tesseractPath
}

func recognizePNGWithTesseract(_ imageURL: URL, psm: String = "6") throws -> [String] {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: try tesseractPath())
    process.arguments = [imageURL.path, "stdout", "-l", "chi_sim+eng", "--psm", psm]
    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr
    try process.run()
    process.waitUntilExit()
    let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let errorOutput = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    guard process.terminationStatus == 0 else {
        throw NSError(domain: "PDFAuditTesseract",
                      code: Int(process.terminationStatus),
                      userInfo: [NSLocalizedDescriptionKey: errorOutput.isEmpty ? "tesseract failed" : errorOutput])
    }
    return output
        .split(whereSeparator: \.isNewline)
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
}

func uniqueLines(_ lines: [String]) -> [String] {
    var seen = Set<String>()
    var result: [String] = []
    for line in lines {
        if seen.insert(line).inserted {
            result.append(line)
        }
    }
    return result
}

func recognizeWithTesseract(_ page: PDFPage, pageNo: Int, scale: Double, outputDir: URL, scanHeader: Bool = false) throws -> [String] {
    let fullImageURL = outputDir.appendingPathComponent("page-\(pageNo)-tesseract.png")
    try renderPNG(page, scale: max(scale, 3.0), to: fullImageURL)
    defer { try? FileManager.default.removeItem(at: fullImageURL) }
    var lines = try recognizePNGWithTesseract(fullImageURL, psm: "6")

    if scanHeader {
        let bounds = page.bounds(for: .mediaBox)
        let topCrop = CGRect(x: bounds.minX, y: bounds.minY + bounds.height * 0.50, width: bounds.width, height: bounds.height * 0.50)
        let headerImageURL = outputDir.appendingPathComponent("page-\(pageNo)-header-tesseract.png")
        try renderRegionPNG(page, crop: topCrop, scale: max(scale, 5.0), to: headerImageURL)
        defer { try? FileManager.default.removeItem(at: headerImageURL) }
        let headerLines = try recognizePNGWithTesseract(headerImageURL, psm: "6")
        lines = uniqueLines(headerLines + lines)
    }

    return lines
}

var outlines: [OutlineNode] = []
if let root = doc.outlineRoot {
    for i in 0..<root.numberOfChildren {
        if let child = root.child(at: i) {
            walk(child, depth: 0, into: &outlines)
        }
    }
}

let manifest = buildManifest(from: outlines)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
try encoder.encode(manifest).write(to: outputDir.appendingPathComponent("manifest.json"))

if ProcessInfo.processInfo.environment["PDF_AUDIT_MANIFEST_ONLY"] == "1" {
    print("manifest_pages=\(manifest.pages.count) outline_count=\(manifest.outlineCount) output=\(outputDir.path)")
    exit(0)
}

let ocrURL = outputDir.appendingPathComponent("ocr.txt")
FileManager.default.createFile(atPath: ocrURL.path, contents: nil)
let handle = try FileHandle(forWritingTo: ocrURL)
defer { try? handle.close() }

func writeLine(_ line: String) {
    if let data = (line + "\n").data(using: .utf8) {
        try? handle.write(contentsOf: data)
    }
}

let skipVision = ProcessInfo.processInfo.environment["PDF_AUDIT_SKIP_VISION"] == "1"
let maxPages = ProcessInfo.processInfo.environment["PDF_AUDIT_MAX_PAGES"].flatMap { Int($0) }
let pagesToProcess = maxPages.map { Array(manifest.pages.prefix($0)) } ?? manifest.pages

for pageNo in pagesToProcess {
    autoreleasepool {
        guard let page = doc.page(at: pageNo - 1) else {
            writeLine("PAGE\t\(pageNo)\tERROR\trender_failed")
            return
        }
        do {
            var source = "vision"
            let lines: [String]
            if skipVision {
                source = "tesseract"
                lines = try recognizeWithTesseract(page, pageNo: pageNo, scale: scale, outputDir: outputDir, scanHeader: shouldScanHeader(for: pageNo, manifest: manifest))
            } else if let image = render(page, scale: scale) {
                do {
                    lines = try recognize(image)
                } catch {
                    source = "tesseract"
                    lines = try recognizeWithTesseract(page, pageNo: pageNo, scale: scale, outputDir: outputDir, scanHeader: shouldScanHeader(for: pageNo, manifest: manifest))
                }
            } else {
                throw NSError(domain: "PDFAuditRender", code: 5, userInfo: [NSLocalizedDescriptionKey: "render_failed"])
            }
            writeLine("PAGE\t\(pageNo)\tLINES\t\(lines.count)\tSOURCE\t\(source)")
            for line in lines {
                writeLine(line.replacingOccurrences(of: "\t", with: " "))
            }
            writeLine("PAGE_END\t\(pageNo)")
        } catch {
            let nsError = error as NSError
            writeLine("PAGE\t\(pageNo)\tERROR\tdomain=\(nsError.domain) code=\(nsError.code) desc=\(nsError.localizedDescription)")
        }
    }
}

print("manifest_pages=\(manifest.pages.count) outline_count=\(manifest.outlineCount) output=\(outputDir.path)")
