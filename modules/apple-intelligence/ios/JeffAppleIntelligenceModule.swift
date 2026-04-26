import ExpoModulesCore
import Foundation
import PDFKit
import UIKit
import Vision

#if canImport(FoundationModels)
import FoundationModels
#endif

public class JeffAppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("JeffAppleIntelligence")

    AsyncFunction("getFoundationAvailability") {
      return foundationAvailability()
    }

    AsyncFunction("generateFoundationText") { (request: [String: Any]) async throws -> String in
      return try await generateFoundationText(request)
    }

    AsyncFunction("analyseImage") { (uri: String) async throws -> [String: Any] in
      return try await analyseImage(uri)
    }

    AsyncFunction("extractPdfText") { (uri: String) throws -> [String: Any] in
      return try extractPdfText(uri)
    }
  }
}

private enum JeffAppleIntelligenceError: Error, LocalizedError {
  case unsupportedPlatform
  case foundationUnavailable(String)
  case invalidRequest
  case unreadableFile(String)
  case unreadableImage(String)
  case emptyPdf

  var errorDescription: String? {
    switch self {
    case .unsupportedPlatform:
      return "Apple Intelligence is only available on supported iOS devices."
    case .foundationUnavailable(let reason):
      return "Apple Foundation Models are unavailable: \(reason)."
    case .invalidRequest:
      return "Apple Foundation request was invalid."
    case .unreadableFile(let uri):
      return "Could not read file: \(uri)"
    case .unreadableImage(let uri):
      return "Could not read image: \(uri)"
    case .emptyPdf:
      return "The PDF did not contain extractable text."
    }
  }
}

private func fileUrl(from uri: String) -> URL {
  if uri.hasPrefix("file://"), let url = URL(string: uri) {
    return url
  }
  return URL(fileURLWithPath: uri)
}

private func foundationAvailability() -> [String: Any?] {
#if canImport(FoundationModels)
  if #available(iOS 26.0, *) {
    let model = SystemLanguageModel.default
    let reason: String?
    switch model.availability {
    case .available:
      reason = nil
    case .unavailable(let unavailableReason):
      reason = "\(unavailableReason)"
    }

    return [
      "available": model.isAvailable,
      "reason": reason,
      "contextSize": model.contextSize
    ]
  }
#endif

  return [
    "available": false,
    "reason": "unsupported-os-or-sdk",
    "contextSize": nil
  ]
}

private func stringValue(_ value: Any?) -> String? {
  guard let value else {
    return nil
  }
  if let value = value as? String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
  return nil
}

private func intValue(_ value: Any?, fallback: Int) -> Int {
  if let value = value as? Int {
    return value
  }
  if let value = value as? Double {
    return Int(value)
  }
  if let value = value as? NSNumber {
    return value.intValue
  }
  return fallback
}

private func promptText(from messages: [[String: Any]]) -> String {
  messages.compactMap { message in
    guard
      let role = stringValue(message["role"]),
      let content = stringValue(message["content"])
    else {
      return nil
    }
    return "\(role.uppercased()): \(content)"
  }.joined(separator: "\n\n")
}

private func generateFoundationText(_ request: [String: Any]) async throws -> String {
#if canImport(FoundationModels)
  if #available(iOS 26.0, *) {
    let model = SystemLanguageModel.default
    guard model.isAvailable else {
      throw JeffAppleIntelligenceError.foundationUnavailable("\(model.availability)")
    }
    guard
      let instructions = stringValue(request["instructions"]),
      let messages = request["messages"] as? [[String: Any]]
    else {
      throw JeffAppleIntelligenceError.invalidRequest
    }

    let session = LanguageModelSession(instructions: instructions)
    let options = GenerationOptions(
      sampling: nil,
      temperature: nil,
      maximumResponseTokens: intValue(request["maxTokens"], fallback: 512)
    )
    let response = try await session.respond(to: promptText(from: messages), options: options)
    return response.content.trimmingCharacters(in: .whitespacesAndNewlines)
  }
#endif

  throw JeffAppleIntelligenceError.unsupportedPlatform
}

private func analyseImage(_ uri: String) async throws -> [String: Any] {
  let url = fileUrl(from: uri)
  guard let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
    throw JeffAppleIntelligenceError.unreadableImage(uri)
  }

  return try await withCheckedThrowingContinuation { continuation in
    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .accurate
    textRequest.usesLanguageCorrection = true
    if #available(iOS 16.0, *) {
      textRequest.automaticallyDetectsLanguage = true
    }

    let classificationRequest = VNClassifyImageRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([textRequest, classificationRequest])

        let text = (textRequest.results ?? [])
          .compactMap { observation in
            observation.topCandidates(1).first?.string
          }
          .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
          .filter { !$0.isEmpty }

        let labels = (classificationRequest.results ?? [])
          .prefix(10)
          .filter { $0.confidence >= 0.2 }
          .map { observation in
            [
              "identifier": observation.identifier,
              "confidence": Double(observation.confidence)
            ] as [String: Any]
          }

        continuation.resume(returning: [
          "text": text,
          "labels": labels
        ])
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }
}

private func extractPdfText(_ uri: String) throws -> [String: Any] {
  let url = fileUrl(from: uri)
  guard let document = PDFDocument(url: url) else {
    throw JeffAppleIntelligenceError.unreadableFile(uri)
  }

  var pages: [String] = []
  for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else {
      continue
    }
    let text = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !text.isEmpty {
      pages.append(text)
    }
  }

  let text = pages.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
  if text.isEmpty {
    throw JeffAppleIntelligenceError.emptyPdf
  }

  return [
    "text": text,
    "pageCount": document.pageCount
  ]
}
