import AppKit
import Foundation

// 从剪贴板提取图片，优先从文件引用读取最新内容
let pb = NSPasteboard.general

// 先尝试从文件 URL 读取（避免缓存）
if let urls = pb.readObjects(forClasses: [NSURL.self], options: nil) as? [URL],
   let url = urls.first,
   let img = NSImage(contentsOf: url),
   let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let rep = NSBitmapImageRep(cgImage: cg)
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: "/tmp/clipboard_img.png"))
    print("\(rep.pixelsWide)x\(rep.pixelsHigh) \(data.count)")
} else if let img = NSImage(pasteboard: pb),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    // 回退：从剪贴板缓存读
    let rep = NSBitmapImageRep(cgImage: cg)
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: "/tmp/clipboard_img.png"))
    print("\(rep.pixelsWide)x\(rep.pixelsHigh) \(data.count)")
} else {
    print("NO_IMAGE")
}
