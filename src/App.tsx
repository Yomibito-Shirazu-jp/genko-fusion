import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  FileCode, 
  CheckCircle, 
  AlertCircle, 
  GitMerge, 
  CloudUpload, 
  LogOut, 
  Sparkles, 
  ExternalLink, 
  RotateCcw, 
  Loader2, 
  Settings, 
  ArrowRight,
  Eye,
  FileEdit,
  ClipboardList,
  Compass,
  BookOpen,
  Plus,
  Trash2,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import mammoth from "mammoth";

// Import custom helpers
import { initAuth, googleSignIn, logout } from "./lib/auth";
import { createGoogleDoc } from "./lib/googleApi";
import { 
  OcrStatus, 
  WordStatus, 
  MergeStatus, 
  DocStatus, 
  GoogleUser,
  GlossaryEntry,
  DocumentChunk
} from "./types";

export default function App() {
  // Authentication State
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Document State
  const [pdfFileName, setPdfFileName] = useState("");
  const [wordFileName, setWordFileName] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [wordText, setWordText] = useState("");
  const [mergedText, setMergedText] = useState("");

  // Human-in-the-Loop (HIL) Validation States
  // (Removed HIL checkboxes for faster workflow)

  // Control/Status States
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [wordStatus, setWordStatus] = useState<WordStatus>("idle");
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>("idle");
  const [docStatus, setDocStatus] = useState<DocStatus>("idle");
  const [ocrLanguage, setOcrLanguage] = useState("Japanese");
  const [errorMessage, setErrorMessage] = useState("");

  // 4000-page high capacity batching queues progress state
  const [ocrProgress, setOcrProgress] = useState(0); 
  const [totalEstimatedPages, setTotalEstimatedPages] = useState(0);
  const [processedPages, setProcessedPages] = useState(0);

  // Workspace Merge control
  const [mergeInstruction, setMergeInstruction] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("smart_layout");
  const [activeTab, setActiveTab] = useState<"pdf" | "word" | "merge" | "glossary_manage">("pdf");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");

  // Google Doc Creation State
  const [docTitle, setDocTitle] = useState("");
  const [createdDocUrl, setCreatedDocUrl] = useState<string | null>(null);

  // Drag & Drop visual focus states
  const [isDragging, setIsDragging] = useState(false);

  // Intelligent Chapter-based Chunking States
  const [isChapterMode, setIsChapterMode] = useState(false);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  // Glossary / Spelling Dictionary State with elegant defaults
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(() => {
    const saved = localStorage.getItem("mergedoc_glossary");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse glossary", e);
      }
    }
    return [
      { id: "def_1", pattern: "サーパー", replacement: "サーバー", description: "サーバーの一般的なスキャナ誤字", createdAt: Date.now() },
      { id: "def_2", pattern: "ィレクター", replacement: "ディレクター", description: "OCR時のディレクター読み取りミス", createdAt: Date.now() },
      { id: "def_3", pattern: "コミュニュケーション", replacement: "コミュニケーション", description: "よくある表記揺れ是正", createdAt: Date.now() },
      { id: "def_4", pattern: "シミュレーション", replacement: "シミュレーション", description: "「シュミレーション」を「シミュレーション」に是正", createdAt: Date.now() },
      { id: "def_5", pattern: "コンテンラ", replacement: "コンテナ", description: "コンテナのスキャン文字破損防止", createdAt: Date.now() },
      { id: "def_6", pattern: "テイスト", replacement: "テキスト", description: "OCR特有のテキスト誤字対応", createdAt: Date.now() }
    ];
  });

  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showGlossaryConfig, setShowGlossaryConfig] = useState(false);

  // Sync glossary to local storage
  useEffect(() => {
    localStorage.setItem("mergedoc_glossary", JSON.stringify(glossary));
  }, [glossary]);

  // Load glossary from Firestore when user changes (Durable Enterprise Cloud Sync)
  useEffect(() => {
    if (user) {
      const fetchGlossaryFromDb = async () => {
        try {
          const { collection, getDocs, query, where } = await import("firebase/firestore");
          const { db } = await import("./lib/auth");
          const q = query(collection(db, "glossary"), where("userId", "==", user.uid));
          const querySnapshot = await getDocs(q);
          const entries: GlossaryEntry[] = [];
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            entries.push({
              id: doc.id,
              userId: data.userId,
              pattern: data.pattern,
              replacement: data.replacement,
              description: data.description || "",
              createdAt: data.createdAt || Date.now(),
            });
          });

          if (entries.length > 0) {
            setGlossary(entries);
          }
        } catch (e) {
          console.error("Firestore glossary load error:", e);
        }
      };
      fetchGlossaryFromDb();
    }
  }, [user]);

  // Firestore & local Glossary Mutators
  const addGlossaryEntry = async () => {
    const p = newPattern.trim();
    const r = newReplacement.trim();
    if (!p || !r) return;

    const newEntry: GlossaryEntry = {
      id: "entry_" + Math.random().toString(36).substring(2, 9),
      pattern: p,
      replacement: r,
      description: newDescription.trim(),
      createdAt: Date.now(),
      userId: user?.uid,
    };

    if (user) {
      try {
        const { collection, addDoc } = await import("firebase/firestore");
        const { db } = await import("./lib/auth");
        const docRef = await addDoc(collection(db, "glossary"), {
          userId: user.uid,
          pattern: p,
          replacement: r,
          description: newDescription.trim(),
          createdAt: Date.now(),
        });
        newEntry.id = docRef.id;
      } catch (e) {
        console.error("Firestore glossary add error:", e);
      }
    }

    setGlossary(prev => [newEntry, ...prev]);
    setNewPattern("");
    setNewReplacement("");
    setNewDescription("");
  };

  const deleteGlossaryEntry = async (id: string) => {
    if (user) {
      try {
        const { doc, deleteDoc } = await import("firebase/firestore");
        const { db } = await import("./lib/auth");
        await deleteDoc(doc(db, "glossary", id));
      } catch (e) {
        console.error("Firestore glossary delete error:", e);
      }
    }
    setGlossary(prev => prev.filter(item => item.id !== id));
  };

  // Google OAuth flow setup
  useEffect(() => {
    initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMessage("");
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
      } else {
        setErrorMessage("サインイン処理がキャンセルされたか、ユーザー情報が取得できませんでした。");
      }
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user' && window.self !== window.top) {
        setErrorMessage("プレビュー画面（iframe）のセキュリティ制限によりログインポップアップが遮断されました。「新しいタブでアプリを起動」から別ウィンドウで開いて再試行してください。");
      } else {
        setErrorMessage(e.message || "Googleサインインに失敗しました。詳細設定を確認してください。");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      handleReset();
    } catch (e) {
      console.error("Google logout error:", e);
    }
  };

  // Glossary Utility Functions
  const countGlossaryMatches = (text: string): number => {
    if (!text || glossary.length === 0) return 0;
    let occurrences = 0;
    glossary.forEach(({ pattern }) => {
      if (!pattern) return;
      try {
        const escaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const matches = text.match(new RegExp(escaped, "gi"));
        if (matches) {
          occurrences += matches.length;
        }
      } catch (err) {
        // Safe regex fallbacks
      }
    });
    return occurrences;
  };

  const applyGlossaryToText = (text: string): string => {
    if (!text || glossary.length === 0) return text;
    let result = text;
    glossary.forEach(({ pattern, replacement }) => {
      if (!pattern) return;
      try {
        const escaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        result = result.replace(new RegExp(escaped, "gi"), replacement);
      } catch (err) {
        // Safe replacement fallbacks
      }
    });
    return result;
  };

  const handleBatchCorrectCurrentText = (tabType: "pdf" | "word" | "merge") => {
    if (tabType === "pdf") {
      setPdfText(prev => applyGlossaryToText(prev));
    } else if (tabType === "word") {
      setWordText(prev => applyGlossaryToText(prev));
    } else if (tabType === "merge") {
      setMergedText(prev => applyGlossaryToText(prev));
    }
  };

  // Intelligent PDF & Word Automatic Synchronized Section-based Alignment Chunker
  const parseSections = (text: string): { title: string; content: string; type: DocumentChunk["type"] }[] => {
    if (!text) return [];
    
    const lines = text.split("\n");
    const parsedSections: { title: string; content: string; type: DocumentChunk["type"] }[] = [];
    
    let currentChunkType: DocumentChunk["type"] = "cover";
    let currentTitle = "表紙・タイトル";
    let currentLines: string[] = [];

    // Simple robust scanning rules
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // TOC detection rule
      const isTocMarker = /目\s*次|INDEX|index|CONTENTS|contents/gi.test(line) && line.length < 15;
      // Chapter detection rule (e.g. 第1章, 1章, Chapter 1, Section 1, 1.1)
      const isChapterMarker = /^(第\s*[一二三四五六七八九十百千0-9]+\s*章|第\s*[一二三四五六七八九十百千0-9]+\s*節|Chapter\s*\d+|[0-9]+[\.\s]章|[0-9]+\.[0-9]+)/gi.test(line) && line.length < 40;

      if (isTocMarker) {
        if (currentLines.length > 0) {
          parsedSections.push({
            title: currentTitle,
            content: currentLines.join("\n"),
            type: currentChunkType
          });
        }
        currentChunkType = "toc";
        currentTitle = "目次構成案";
        currentLines = [line];
      } else if (isChapterMarker) {
        if (currentLines.length > 0) {
          parsedSections.push({
            title: currentTitle,
            content: currentLines.join("\n"),
            type: currentChunkType
          });
        }
        currentChunkType = "chapter";
        currentTitle = line;
        currentLines = [line];
      } else {
        currentLines.push(lines[i]);
      }
    }

    if (currentLines.length > 0) {
      parsedSections.push({
        title: currentTitle,
        content: currentLines.join("\n"),
        type: currentChunkType
      });
    }

    return parsedSections;
  };

  // Chapter syncing aligner
  const handleAutoChunkingSync = (completedOcrText: string, completedWordText: string) => {
    const ocrSections = parseSections(completedOcrText || pdfText);
    const wordSections = parseSections(completedWordText || wordText);

    // Combine chapters or fallback to standard ones
    const newChunks: DocumentChunk[] = [];
    const maxLen = Math.max(ocrSections.length, wordSections.length);

    if (maxLen === 0) {
      newChunks.push({
        id: "chunk_cover",
        title: "全原稿ドキュメント",
        pdfOcrText: completedOcrText || pdfText,
        wordText: completedWordText || wordText,
        mergedText: "",
        status: "idle",
        approved: false,
        type: "cover"
      });
    } else {
      for (let i = 0; i < maxLen; i++) {
        const ocrSec = ocrSections[i];
        const wordSec = wordSections[i];
        
        newChunks.push({
          id: `chunk_${i + 1}`,
          title: ocrSec?.title || wordSec?.title || `第 ${i + 1} セクション`,
          pdfOcrText: ocrSec?.content || "",
          wordText: wordSec?.content || "",
          mergedText: "",
          status: "idle",
          approved: false,
          type: ocrSec?.type || wordSec?.type || "chapter"
        });
      }
    }

    setChunks(newChunks);
    if (newChunks.length > 0) {
      setSelectedChunkId(newChunks[0].id);
    }
  };

  // Chunk Speller adaptors
  const applyGlossaryToChunk = (chunkId: string, attr: "pdf" | "word") => {
    setChunks(prev => prev.map(c => {
      if (c.id === chunkId) {
        if (attr === "pdf") {
          return { ...c, pdfOcrText: applyGlossaryToText(c.pdfOcrText) };
        } else {
          return { ...c, wordText: applyGlossaryToText(c.wordText) };
        }
      }
      return c;
    }));
  };

  const handleUpdateChunkText = (chunkId: string, attr: "pdf" | "word" | "merged", newText: string) => {
    setChunks(prev => prev.map(c => {
      if (c.id === chunkId) {
        if (attr === "pdf") return { ...c, pdfOcrText: newText };
        if (attr === "word") return { ...c, wordText: newText };
        if (attr === "merged") return { ...c, mergedText: newText, approved: false };
      }
      return c;
    }));
  };

  const handleAddCustomChunk = () => {
    const newId = `chunk_custom_${Date.now()}`;
    const newChunk: DocumentChunk = {
      id: newId,
      title: `新規カスタムセクション ${chunks.length + 1}`,
      pdfOcrText: "",
      wordText: "",
      mergedText: "",
      status: "idle",
      approved: false,
      type: "chapter"
    };
    setChunks(prev => [...prev, newChunk]);
    setSelectedChunkId(newId);
  };

  const handleDeleteChunk = (id: string) => {
    setChunks(prev => prev.filter(c => c.id !== id));
    if (selectedChunkId === id) {
      setSelectedChunkId(chunks[0]?.id || null);
    }
  };

  // Chapter Master Assembly
  const handleAssembleMasterDoc = () => {
    const sortedDrafts = chunks.map(c => {
      const header = `## ${c.title}\n\n`;
      const txt = c.mergedText || c.wordText || c.pdfOcrText || "*（このセクションはマージ・抽出されていません）*";
      return header + txt + "\n\n---\n\n";
    });
    const assembled = "# 統合マスター原稿（章別差分・突合推敲成果物）\n\n" + sortedDrafts.join("");
    setMergedText(assembled);
    setIsChapterMode(false);
    setActiveTab("merge");
  };

  // File Upload parsers (drag & drop support)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleOcrLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setOcrLanguage(e.target.value);
  };

  const processWordFiles = async (files: File[], append: boolean = false) => {
    setWordStatus("loading");
    setErrorMessage("");

    try {
      let currentResultText = append ? wordText : "";
      let currentNames = append && wordFileName ? wordFileName : "";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const rawText = result.value || "";
        
        currentResultText += (currentResultText ? "\n\n" : "") + rawText;
        currentNames += (currentNames ? ", " : "") + file.name;
      }
      
      setWordFileName(currentNames);
      setWordText(currentResultText);
      setWordStatus("completed");

      // Trigger automatic align chunker dynamically
      handleAutoChunkingSync(pdfText, currentResultText);
    } catch (e: any) {
      setWordStatus("failed");
      setErrorMessage("Word原稿の解析に失敗しました。正しい .docx を指定してください。");
      console.error(e);
    }
  };

  const processPdfOcrFiles = async (files: File[], append: boolean = false) => {
    setPdfStatus("loading");
    setErrorMessage("");
    setOcrProgress(5); // Start progress bar

    try {
      let currentResultText = append ? pdfText : "";
      let currentNames = append && pdfFileName ? pdfFileName : "";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        const base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const result = reader.result as string;
            const b64 = result.replace(/^data:(.*,)?/, "");
            resolve(b64);
          };
          reader.onerror = (e) => reject(e);
        });

        // Track multi-step progress bar visually for performance transparency on large documents
        const progressTimer = setInterval(() => {
          setOcrProgress(prev => {
            if (prev >= 90) {
              clearInterval(progressTimer);
              return 90;
            }
            return prev + 10;
          });
        }, 800);

        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfBase64: base64String,
            language: ocrLanguage,
          }),
        });

        clearInterval(progressTimer);

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP error! status ${response.status}`);
        }

        const data = await response.json();
        const newText = data.text || data.ocrText || "";
        currentResultText += (currentResultText ? "\n\n" : "") + newText;
        currentNames += (currentNames ? ", " : "") + file.name;
        
        setOcrProgress(5 + Math.floor(((i + 1) / files.length) * 90));
      }

      setPdfFileName(currentNames);
      setPdfText(currentResultText);
      setOcrProgress(100);
      setPdfStatus("completed");

      // Trigger automatic chunking synchronizer instantly
      handleAutoChunkingSync(currentResultText, wordText);
    } catch (e: any) {
      setPdfStatus("failed");
      setOcrProgress(0);
      setErrorMessage("PDF OCRの配信エンジンでエラーが発生しました。時間を空けて再試行するか、手動入力をお試しください。");
      console.error(e);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const pdfFiles = files.filter(f => f.name.endsWith(".pdf"));
    const wordFiles = files.filter(f => f.name.endsWith(".docx"));

    if (pdfFiles.length > 0) {
      await processPdfOcrFiles(pdfFiles, true);
    }
    if (wordFiles.length > 0) {
      await processWordFiles(wordFiles, true);
    }
  };

  const handlePdfUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processPdfOcrFiles(Array.from(files), true);
    }
    e.target.value = "";
  };

  const handleWordUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processWordFiles(Array.from(files), true);
    }
    e.target.value = "";
  };

  const setPdfStatus = (status: OcrStatus) => {
    setOcrStatus(status);
  };

  // Reset core Workspace
  const handleReset = () => {
    setPdfFileName("");
    setWordFileName("");
    setPdfText("");
    setWordText("");
    setMergedText("");
    setOcrStatus("idle");
    setWordStatus("idle");
    setMergeStatus("idle");
    setDocStatus("idle");
    setErrorMessage("");
    setChunks([]);
    setSelectedChunkId(null);
    setIsChapterMode(false);
    setOcrProgress(0);
    setCreatedDocUrl(null);
    setDocTitle("");
  };

  // Presets text mapper
  const getMergePromptWithPreset = (): string => {
    let base = "あなたは、プロフェッショナルな総合出版編集者および優秀な自動校正推敲エンジンです。";
    if (selectedPreset === "smart_layout") {
      base += "【スマートレイアウト構造化】指示のあったPDF OCR修正箇所（赤字入れ）とWordのオリジナル下書きを照らし合わせ、レイアウトをきれいに維持し（目次のツリー構造や表のMarkdown補正）、修正点のみを忠実に差し替えた、完璧な推敲成果物を作成してください。";
    } else if (selectedPreset === "strict_replace") {
      base += "【完全非破壊・赤入れ置換】Word原稿の文章構成は一文字も変えず、PDF側に赤字で具体的に指定された表記是正、誤字脱字、改行、追加段落指示の指示箇所のみを厳密に置換・マージして反映させてください。その他の勝手なトーンの改変は一切禁止します。";
    } else if (selectedPreset === "creative_edit") {
      base += "【編集者トーン最適化】出版物としてのクオリティを発揮するため、赤字の要件を完全にクリアしつつ、全体の文脈、専門用語、読者の引き込みやすさを考慮して、より引き締まった格調高いトーンに美しくリライティングを行ってください。";
    }
    
    if (mergeInstruction.trim()) {
      base += `\n【追加指示書要件】: ${mergeInstruction.trim()}`;
    }

    if (glossary.length > 0) {
      base += "\n\n【必須 表記是正 辞書規則】:\n以下の単語パターンが検出された場合には、必ず置換後の文字表記に正しく統一・修正した上で出力してください：";
      glossary.forEach(g => {
        base += `\n・「${g.pattern}」は必ず 「${g.replacement}」 に統一する。`;
      });
    }

    return base;
  };

  // Consolidated AI Engine Trigger
  const handleConsolidatedMerge = async () => {
    if (!pdfText && !wordText) {
      setErrorMessage("処理するドキュメントがありません。");
      return;
    }

    setMergeStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: [pdfText, wordText].filter(Boolean),
          instruction: getMergePromptWithPreset(),
          glossary,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `マージエンジンの実行に失敗しました(HTTP ${response.status})`);
      }

      const data = await response.json();
      setMergedText(data.mergedText || "");
      setMergeStatus("completed");
      setActiveTab("merge");
    } catch (e: any) {
      setMergeStatus("failed");
      setErrorMessage(e.message || "AIマージ中に接続エラーが発生しました。");
    }
  };

  // Chapter-by-Chapter AI Engine Trigger
  const handleMergeSingleChunk = async (chunkId: string) => {
    setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, status: "merging" } : c));
    
    const targetChunk = chunks.find(c => c.id === chunkId);
    if (!targetChunk) return;

    try {
      const response = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: [targetChunk.pdfOcrText, targetChunk.wordText].filter(Boolean),
          instruction: getMergePromptWithPreset(),
          glossary,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setChunks(prev => prev.map(c => c.id === chunkId ? { 
        ...c, 
        mergedText: data.mergedText || "", 
        status: "completed" 
      } : c));
    } catch (e: any) {
      console.error(e);
      setChunks(prev => prev.map(c => c.id === chunkId ? { ...c, status: "failed" } : c));
      setErrorMessage(`セクション「${targetChunk.title}」のマージに失敗しました: ` + (e.message || "エラー"));
    }
  };

  // Export to Google Docs (Supports authenticated scopes completely)
  const handleExportToGoogleDocs = async () => {
    if (!mergedText) {
      setErrorMessage("成果物結合テキストがありません。");
      return;
    }

    setDocStatus("creating");
    setErrorMessage("");

    try {
      const title = docTitle.trim() || `成果物_統合本番原稿_${new Date().toLocaleDateString()}`;
      const result = await createGoogleDoc(title, mergedText, accessToken || "");
      setCreatedDocUrl(result.documentUrl);
      setDocStatus("completed");
    } catch (e: any) {
      setDocStatus("failed");
      setErrorMessage("Google ドキュメントの作成中に権限/APIエラーが発生しました。再度ログインをお願いします。");
      console.error(e);
    }
  };

  // Markdown pre-renderer layout
  const renderDocumentPreview = (text: string) => {
    if (!text) return <p className="text-slate-400 italic">プレビューデータがまだありません。</p>;
    
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("# ")) {
        return <h1 key={idx} className="text-xl font-extrabold text-slate-900 border-b pb-2 mb-4 mt-6">{line.substring(2)}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={idx} className="text-lg font-bold text-indigo-900 mb-3 mt-5">{line.substring(3)}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={idx} className="text-base font-semibold text-slate-800 mb-2 mt-4">{line.substring(4)}</h3>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={idx} className="ml-5 list-disc text-xs text-slate-705 mb-1">{line.substring(2)}</li>;
      }
      if (line.startsWith("---")) {
        return <hr key={idx} className="my-6 border-slate-200" />;
      }
      return <p key={idx} className="text-xs text-slate-700 leading-relaxed mb-2 min-h-[1rem]">{line}</p>;
    });
  };

  // Filter chunks array safely
  const activeChunk = chunks.find(c => c.id === selectedChunkId);

  // If user is not signed in, show Google SSO Sign In Gate strictly
  if (needsAuth) {
    return (
      <div 
        id="login-page-container"
        className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6"
      >
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-xl border border-slate-200/80 text-center relative overflow-hidden">
          {/* Logo Accents */}
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600"></div>
          
          <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 border border-indigo-100 shadow-sm animate-pulse">
            <GitMerge className="w-8 h-8 text-indigo-600" />
          </div>

          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            合本AIマージ・推敲
          </h2>
          <p className="text-slate-400 text-xs mt-2 font-medium leading-relaxed max-w-xs mx-auto">
            スキャナPDFの追加赤入れ修正指示と、Word執筆原稿の突合・一括マージ・HIL編集承認プラットフォーム
          </p>

          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs text-left"
            >
              <p className="font-bold">OAuth エラー</p>
              <p className="text-[11px] mt-1 leading-normal">{errorMessage}</p>
            </motion.div>
          )}

          <div className="mt-8">
            <button
              id="google-sso-button"
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 border border-slate-250 py-3 px-4 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-45"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  <span>Googleサインイン中...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google アカウントでログイン</span>
                </>
              )}
            </button>
            <button
              onClick={() => setNeedsAuth(false)}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-transparent hover:bg-slate-50 py-3 px-4 rounded-xl text-[11px] font-bold text-slate-500 transition-all cursor-pointer active:scale-98"
            >
              機能だけを試す（クラウド保存なし）
            </button>
          </div>

          {typeof window !== "undefined" && window.self !== window.top && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 text-xs text-left">
              <p className="font-bold flex items-center gap-1.5 text-amber-900">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                プレビュー表示中の制限について
              </p>
              <p className="text-[11px] mt-1.5 leading-normal font-medium text-amber-700">
                AI Studioのプレビュー画面（iframe内）は、ブラウザのセキュリティ制限（COOPポリシー）によりGoogleログインのポップアップが正しく通信できない場合があります。<br />
                <span className="font-bold text-amber-900 text-[10px] block mt-1">※ ログインを押しても画面が切り替わらない場合は、画面右上にある「新しいウィンドウで開く」アイコン、または以下のボタンから別タブで起動してください。</span>
              </p>
              <div className="mt-3 text-center">
                <a 
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  新しいタブでアプリを起動
                </a>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-medium">※ Google Workspace APIs（Docs / Drive）による合稿保存・自動認可のためにGoogle認証をご用意しています。</p>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in full operational panel
  return (
    <div 
      id="main-app-container"
      className="min-h-screen bg-slate-50 flex flex-col justify-between"
    >
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 py-3 px-6 shrink-0 relative">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold shadow-sm">
              <GitMerge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1.5 leading-none">
                合本MergeDoc <span className="text-[9px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider">Enterprise AI</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">4000ページ超級プロ対応・差分突合 / HIL承認ワークプレイス</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick toggle mode with helpful badges */}
            <div className="hidden md:flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <button
                onClick={() => { setIsChapterMode(false); }}
                className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${!isChapterMode ? 'bg-white text-slate-800 shadow-xxs' : 'text-slate-405 hover:text-slate-700'}`}
              >
                標準マージ（全体一括）
              </button>
              <button
                onClick={() => { setIsChapterMode(true); }}
                className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${isChapterMode ? 'bg-white text-slate-800 shadow-xxs' : 'text-slate-405 hover:text-slate-700'}`}
              >
                <span>章・節チャッキング＆構造突合</span>
                <span className="bg-indigo-100 text-indigo-700 text-[8px] font-black px-1 py-0.5 rounded-sm">4000p推奨</span>
              </button>
            </div>

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="w-7 h-7 rounded-full border border-slate-200 hover:scale-105 transition-all shadow-xs" referrerPolicy="no-referrer" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs">{user?.displayName?.charAt(0) || "U"}</span>
              )}
              <div className="hidden lg:block text-left leading-none">
                <p className="text-[10px] font-bold text-slate-700">{user?.displayName}</p>
                <p className="text-[8.5px] text-slate-400 mt-0.5">{user?.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="hover:bg-slate-100 p-2 rounded-lg text-slate-400 hover:text-red-500 transition-all cursor-pointer shadow-none border-none outline-none"
                title="ログアウト"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container Workspace Grid */}
      <main className="max-w-7xl mx-auto px-6 py-6 flex-1 w-full flex flex-col gap-6">
        
        {/* Error notification window */}
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-rose-50 border border-rose-150 rounded-2xl flex items-start gap-3 shadow-xs text-left"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold text-rose-800">処理中に制約 / 失敗が起きている可能性があります：</h4>
              <p className="text-[11px] text-rose-700 mt-1 font-medium leading-relaxed">{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage("")}
              className="text-xs text-rose-400 hover:text-rose-600 font-bold px-2 py-1 bg-white border border-rose-100 rounded-lg hover:shadow-xs transition-normal shrink-0 active:scale-95 cursor-pointer"
            >
              閉じる
            </button>
          </motion.div>
        )}

        {/* Glossary spelling configuration trigger panel */}
        {showGlossaryConfig ? (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm text-left animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-700">【タイポ・表記揺れ防止】辞書規律辞書データベースの管理</h3>
              </div>
              <button 
                onClick={() => setShowGlossaryConfig(false)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg transition-all cursor-pointer"
              >
                完了して閉じる
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">
              登録された単語のペアは、PDF OCR結果、Wordの受入テキスト、マージ後の成果物ドキュメントをチェックして自動的に表記揺れ数の件数を抽出し、一クリックで一括適正化置換を行える辞書機能です（ユーザーデータとしてセカンダリFirestoreに永続化されます）。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/60 mb-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">誤植・揺れワード「これ」を</label>
                <input 
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="例: シユミレーション"
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white font-medium outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">統一表記ワード「これ」に直す</label>
                <input 
                  type="text"
                  value={newReplacement}
                  onChange={(e) => setNewReplacement(e.target.value)}
                  placeholder="例: シミュレーション"
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white font-medium outline-none focus:border-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">備考（適用理由）</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="例: 技術本としての正確なカタカナ誤植対応"
                    className="flex-1 text-xs border border-slate-200 rounded-lg p-2 bg-white font-medium outline-none focus:border-indigo-500"
                  />
                  <button 
                    onClick={addGlossaryEntry}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 rounded-lg border border-indigo-500 shadow-sm cursor-pointer whitespace-nowrap active:scale-95 transition-all"
                  >
                    辞書に追加
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <th className="p-3">誤植スキャン（パターン）</th>
                    <th className="p-3">置換先（正しい単語）</th>
                    <th className="p-3">注釈（理由）</th>
                    <th className="p-3 text-right">管理</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {glossary.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-rose-700">{g.pattern}</td>
                      <td className="p-3 font-semibold text-green-700">→ {g.replacement}</td>
                      <td className="p-3 text-slate-405 font-medium">{g.description || "—"}</td>
                      <td className="p-3 text-right">
                        <button 
                          onClick={() => deleteGlossaryEntry(g.id)}
                          className="text-[10px] text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg font-bold transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {glossary.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400 italic">登録されている辞書パターンがありません。上記のフォームから最初の一件を登録してください。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </motion.div>
        ) : null}

        {/* Global mode controller buttons on mobile */}
        <div className="flex md:hidden flex-col gap-2 bg-white p-3.5 rounded-2xl border border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">動作ワークフローモード：</p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={() => { setIsChapterMode(false); }}
              className={`text-xs py-2 rounded-xl font-bold border ${!isChapterMode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
            >
              一括マージ（小規模向）
            </button>
            <button
              onClick={() => { setIsChapterMode(true); }}
              className={`text-xs py-2 rounded-xl font-bold border flex items-center justify-center gap-1 ${isChapterMode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
            >
              <span>章別 alignment</span>
              <span className="w-1.5 h-1.5 bg-indigo-650 rounded-full animate-ping"></span>
            </button>
          </div>
        </div>

        {/* Main Workspace Frame Switcher conditional branch */}
        {isChapterMode ? (
          /* Chapter based Chunking & Alignment Mode Interface Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-stretch animate-fade-in">
            {/* Left Column Chapter navigation tree */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col max-h-[660px] shadow-sm text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-3.5 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4.5 h-4.5 text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-700">自動検知された章別・構成一覧</h3>
                </div>
                <button
                  onClick={handleAddCustomChunk}
                  className="inline-flex items-center gap-1 text-[10px] bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-150 font-bold px-2 py-1 rounded-lg transition-all cursor-pointer"
                  title="手動で別の章やセクションを挿入します"
                >
                  <Plus className="w-3 h-3" />
                  <span>セクション追加</span>
                </button>
              </div>

              {/* Dynamic scroll list */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
                {chunks.map((docChunk) => {
                  const isActive = docChunk.id === selectedChunkId;
                  const hasMerged = !!docChunk.mergedText;

                  return (
                    <div
                      key={docChunk.id}
                      onClick={() => setSelectedChunkId(docChunk.id)}
                      className={`group p-3 border rounded-2xl cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isActive 
                          ? "bg-indigo-50/40 border-indigo-300 ring-1 ring-indigo-500/5 shadow-xs" 
                          : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex-1 leading-normal text-left">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            docChunk.approved 
                              ? 'bg-green-500' 
                              : hasMerged 
                                ? 'bg-indigo-400' 
                                : 'bg-slate-300'
                          }`}></span>
                          <span className="font-extrabold text-[11px] text-slate-800 line-clamp-1">{docChunk.title}</span>
                        </div>
                        <div className="flex gap-2.5 mt-1.5 font-semibold text-[8px] uppercase tracking-wider font-mono">
                          <span className={`${docChunk.pdfOcrText ? 'text-indigo-600/80':'text-slate-350'}`}>OCR_IN: {docChunk.pdfOcrText ? `${docChunk.pdfOcrText.length}字` : '0'}</span>
                          <span className="text-slate-300">•</span>
                          <span className={`${docChunk.wordText ? 'text-indigo-600/80':'text-slate-350'}`}>WORD_IN: {docChunk.wordText ? `${docChunk.wordText.length}字` : '0'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        {docChunk.approved && (
                          <span className="text-[9px] font-black text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md border border-green-200 shrink-0">HIL承認済</span>
                        )}
                        {!docChunk.approved && hasMerged && (
                          <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200 shrink-0">AI済・未承認</span>
                        )}
                        {docChunk.id.startsWith("chunk_custom_") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChunk(docChunk.id);
                            }}
                            className="text-slate-400 hover:text-red-500 p-1 bg-slate-50 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {chunks.length === 0 && (
                  <div className="py-16 text-center border-2 border-dashed border-slate-150 rounded-2xl bg-slate-50/40 text-slate-400 px-4">
                    <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-bounce" />
                    <p className="text-xs font-bold leading-relaxed">章データがロードされていません</p>
                    <p className="text-[10px] text-slate-400 mt-1">PDF OCR結果とWord解析ファイルをロードすると、自動的に章をセクションマッピングします。</p>
                  </div>
                )}
              </div>

              {/* Master assembler action card */}
              {chunks.length > 0 && (
                <div className="bg-slate-50 p-3.5 border-t border-slate-100 mt-4 rounded-2xl flex flex-col gap-2.5 flex-shrink-0">
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">章別承認進捗 :</span>
                    <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                      【承認率 {chunks.filter(c => c.approved).length} / {chunks.length}】全セクションの推敲が完了した後にマスター成果物を結合します。
                    </p>
                  </div>
                  <button
                    onClick={handleAssembleMasterDoc}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-2xl border border-indigo-500 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/25 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <GitMerge className="w-4 h-4 text-white" />
                    <span>検証済み各章を統合してマスター原稿組立</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Column workspace chapter focused editor */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col h-[660px] shadow-sm text-left">
              {activeChunk ? (
                <div className="flex-1 flex flex-col h-full justify-between min-h-0">
                  {/* Top Bar detailing current active chapter metadata */}
                  <div className="border-b border-slate-100 pb-3 mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-shrink-0">
                    <div className="text-left">
                      <span className="text-[10px] bg-slate-100 font-bold text-slate-500 px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">アクティブワークスペース</span>
                      <h3 className="text-sm font-black text-slate-800 mt-1 flex items-center gap-1 bg-white">
                        <ArrowRight className="w-4 h-4 text-indigo-600" />
                        <span>{activeChunk.title}</span>
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowGlossaryConfig(true)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/60 font-bold text-[10px] px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Settings className="w-3.5 h-3.5 text-amber-600" />
                        <span>是正辞書 ({countGlossaryMatches(activeChunk.pdfOcrText + activeChunk.wordText)}件検知)</span>
                      </button>
                    </div>
                  </div>

                  {/* Dual Pane Text Split Editor (PDF OCR Source left vs Word Draft right) */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 mb-3.5">
                    
                    {/* Left Pane: PDF OCR Correct Instruction Area */}
                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/20 flex flex-col h-full min-h-0">
                      <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <span className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                          PDF OCR修正赤入れ抽出
                        </span>
                        
                        {activeChunk.pdfOcrText && countGlossaryMatches(activeChunk.pdfOcrText) > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded border border-amber-200">揺れ {countGlossaryMatches(activeChunk.pdfOcrText)}件</span>
                            <button
                              onClick={() => applyGlossaryToChunk(activeChunk.id, "pdf")}
                              className="text-[8px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-1 rounded transition-all cursor-pointer"
                              title="検出表記を辞書設定値に置換します"
                            >
                              是正
                            </button>
                          </div>
                        )}
                        <span className="text-[9px] font-mono text-slate-400 font-semibold">{activeChunk.pdfOcrText ? `${activeChunk.pdfOcrText.length}字` : "空"}</span>
                      </div>
                      
                      <textarea
                        value={activeChunk.pdfOcrText}
                        onChange={(e) => handleUpdateChunkText(activeChunk.id, "pdf", e.target.value)}
                        placeholder="PDF OCRのスキャナ赤字、レイアウト情報、図示された指示などをコピペ・確認します。"
                        className="flex-1 w-full bg-slate-100/50 focus:bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-505 font-sans leading-relaxed text-xs resize-none overflow-y-auto font-medium text-slate-700"
                      />
                    </div>

                    {/* Right Pane: Word Draft Base Document Section */}
                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/20 flex flex-col h-full min-h-0">
                      <div className="flex items-center justify-between mb-2 flex-shrink-0">
                        <span className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
                          <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                          Word原稿テキスト (.docx)
                        </span>

                        {activeChunk.wordText && countGlossaryMatches(activeChunk.wordText) > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-800 shadow-xxs shrink-0">
                            <span>表記揺れ {countGlossaryMatches(activeChunk.wordText)}件</span>
                            <button
                              onClick={() => applyGlossaryToChunk(activeChunk.id, "word")}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[8px] px-2 py-0.5 rounded transition-all cursor-pointer shadow-xs"
                            >
                              辞書一括適正化
                            </button>
                          </div>
                        )}
                        <span className="text-[9px] font-mono text-slate-400 font-semibold">{activeChunk.wordText ? `${activeChunk.wordText.length}字` : "空"}</span>
                      </div>

                      <textarea
                        value={activeChunk.wordText}
                        onChange={(e) => handleUpdateChunkText(activeChunk.id, "word", e.target.value)}
                        placeholder="WORD原稿（表紙、目次、章などの該当箇所）。コピペや編集も可能です。"
                        className="flex-1 w-full bg-slate-50/30 focus:bg-white border border-slate-200 p-3 rounded-2xl outline-none focus:border-indigo-500 font-sans leading-relaxed text-xs resize-none overflow-y-auto font-medium text-slate-705"
                      />
                    </div>
                  </div>

                  {/* Center Section: AI Merge Trigger for this Chapter */}
                  <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
                    <div className="text-left leading-tight">
                      <h4 className="text-xs font-bold text-slate-800">このセクションを個別にAI差分突合＆抽出マージ</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                        PDFの追加修正赤入れとレイアウトのアウトラインに基づいて、Word原稿の適切な表現案を突合抽出し合成します。
                      </p>
                    </div>

                    <button
                      onClick={() => handleMergeSingleChunk(activeChunk.id)}
                      disabled={activeChunk.status === "merging"}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl border border-indigo-500 disabled:border-slate-200 transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:text-slate-405"
                    >
                      {activeChunk.status === "merging" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>差分突合マージ中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI突合＆原稿抽出を実行</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Bottom Section: Merged Output Preview and HIL Approval Checklist */}
                  <div className="border border-indigo-100 bg-indigo-50/10 rounded-2xl p-4 flex flex-col gap-2 max-h-[160px] overflow-y-auto shrink-0 text-left mt-3">
                    <div className="flex items-center justify-between flex-shrink-0">
                      <span className="text-[11px] font-extrabold text-indigo-955 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-650" />
                        AI突合・抽出済みの最新成果物（マークダウン直接プレビュー・編集可）
                      </span>
                      <span className="text-[9px] font-mono text-slate-400 font-medium">{(activeChunk.mergedText || "").length}字</span>
                    </div>
                    
                    <textarea
                      value={activeChunk.mergedText}
                      onChange={(e) => handleUpdateChunkText(activeChunk.id, "merged", e.target.value)}
                      placeholder="「AI突合＆原稿抽出を実行」をクリックすると、ここに統合推敲履歴が表示されます。納得いくまで直接手動加筆・修正・プレビューが可能です。"
                      className="w-full h-14 bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 leading-normal focus:border-indigo-500 outline-none font-sans font-medium"
                    />

                    <div className="flex items-center justify-between border-t border-indigo-50/60 pt-2 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`approve-${activeChunk.id}`}
                          checked={activeChunk.approved}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setChunks(prev => prev.map(c => c.id === activeChunk.id ? { ...c, approved: checked } : c));
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                        <label htmlFor={`approve-${activeChunk.id}`} className="text-xs font-bold text-indigo-950 cursor-pointer select-none">
                          【HIL承認】この章・見出し単位の差分検証を終え「目視確認承認」する
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50/30 text-center">
                  <Compass className="w-12 h-12 text-slate-350 mb-3" />
                  <h3 className="text-sm font-bold text-slate-700">セクションが選択されていません</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed font-semibold">
                    左側のナビゲーションリストから、推敲・対比を行いたい「章」または「表紙」をクリックして作業を開始してください。
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Normal Document Full-Merge Workspace Layout (Double-pane workspace setup) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-stretch relative">
            
            {/* Left Workspace Panel: Input file drag & drop & merging config */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col gap-5 shadow-sm text-left">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <CloudUpload className="w-4.5 h-4.5 text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-700">原稿アセット・ファイル登録</h3>
                </div>
                <button
                  onClick={handleReset}
                  className="text-[10px] text-slate-400 hover:text-red-500 bg-slate-50 border border-slate-200 aspect-square p-1.5 rounded-lg transition-all cursor-pointer shadow-xxs"
                  title="作業進捗を完全にリセットし最初からやり直します"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Robust Drag & Drop area */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all flex flex-col items-center justify-center relative ${
                  isDragging 
                    ? "border-indigo-500 bg-indigo-50/20 shadow-inner scale-[0.99]" 
                    : "border-slate-204 bg-slate-50/40 hover:bg-slate-50"
                }`}
              >
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-3 border border-indigo-100/60 shadow-xxs">
                  <CloudUpload className={`w-5 h-5 text-indigo-600 ${isDragging ? 'animate-bounce' : ''}`} />
                </div>
                <h4 className="text-xs font-bold text-slate-800">原稿ファイルをドラッグ＆ドロップ</h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-normal font-semibold">
                  PDF（赤字修正指示）と Word（原稿.docx）をここに重ねて配置します。
                  <br />同時投入も、個別クリックでの選択肢も。
                </p>

                {/* Simulated capacity support details */}
                <div className="mt-4 px-3 py-1.5 bg-indigo-50/35 rounded-lg border border-indigo-100/50 text-[9px] text-indigo-700 font-bold inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
                  最大4000ページ / 20MB 級エンタープライズファイル登録対応
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 w-full">
                  <label className="bg-white hover:bg-slate-50 text-slate-650 hover:text-slate-800 border border-slate-250 font-bold text-[10px] py-2 px-3 rounded-lg shadow-xxs active:scale-95 transition-all text-center cursor-pointer">
                    PDFを追加
                    <input type="file" multiple accept=".pdf" onChange={handlePdfUploadInput} className="hidden" />
                  </label>
                  <label className="bg-white hover:bg-slate-50 text-slate-650 hover:text-slate-800 border border-slate-250 font-bold text-[10px] py-2 px-3 rounded-lg shadow-xxs active:scale-95 transition-all text-center cursor-pointer">
                    WORDを追加
                    <input type="file" multiple accept=".docx" onChange={handleWordUploadInput} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Progress status indicators */}
              <div className="space-y-3">
                <div className="p-3 border border-slate-200 bg-white rounded-2xl flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="font-extrabold text-[#111111] line-clamp-1 truncate">{pdfFileName || "PDF未ロード"}</p>
                      <p className="text-[9.5px] text-slate-400 font-semibold">{pdfText ? `OCR取得テキスト: ${pdfText.length}文字` : "修正要件が記載されたPDF"}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                    ocrStatus === "loading" 
                      ? 'bg-amber-100 text-amber-700 font-bold' 
                      : ocrStatus === "completed" 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-slate-100 text-slate-500'
                  }`}>
                    {ocrStatus === "loading" ? "OCR解析中..." : ocrStatus === "completed" ? "完了" : "未待機"}
                  </span>
                </div>

                {/* Progress bar specifically designed for heavy documents (4000p loading) */}
                {ocrStatus === "loading" && (
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                    <motion.div 
                      className="bg-indigo-600 h-1.5" 
                      initial={{ width: "0%" }}
                      animate={{ width: `${ocrProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}

                <div className="p-3 border border-slate-205 bg-white rounded-2xl flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileCode className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="font-extrabold text-[#111111] line-clamp-1 truncate">{wordFileName || "Word未ロード"}</p>
                      <p className="text-[9.5px] text-slate-405 font-semibold">{wordText ? `Word取得テキスト: ${wordText.length}文字` : "書籍の原稿下書きdocx"}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                    wordStatus === "loading" 
                      ? 'bg-amber-100 text-amber-700 font-bold' 
                      : wordStatus === "completed" 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-slate-100 text-slate-500'
                  }`}>
                    {wordStatus === "loading" ? "Word読込中..." : wordStatus === "completed" ? "読込完了" : "未待機"}
                  </span>
                </div>
              </div>

              {/* Settings configuration form */}
              <div className="border border-slate-200 rounded-3xl p-4 bg-slate-50/30 flex flex-col gap-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-left">マージパラメータ＆追加指示書</span>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">推敲エンジントーンプリセット</label>
                  <select 
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-705 border border-slate-200 rounded-lg p-2 bg-white appearance-none outline-none focus:border-indigo-500"
                  >
                    <option value="smart_layout">スマートレイアウト構造化（標準）</option>
                    <option value="strict_replace">完全非破壊・赤入れのみを忠実に適用</option>
                    <option value="creative_edit">編集者トーン最適化リライティング</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">マージAIへの追加オーダー・制約指示</label>
                  <textarea 
                    value={mergeInstruction}
                    onChange={(e) => setMergeInstruction(e.target.value)}
                    placeholder="例: 文末は「〜です」「〜ます」に統一する、表図内の数値表記をMarkdown書式に是正する、など。自由指示が適用されます。"
                    className="w-full text-xs font-medium text-slate-700 border border-slate-200 rounded-lg p-2.5 bg-white outline-none focus:border-indigo-500 min-h-[60px] max-h-[140px]"
                  />
                </div>

                {/* Consolidated merge action execution button */}
                <button
                  onClick={handleConsolidatedMerge}
                  disabled={mergeStatus === "loading" || (!wordText && !pdfText)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-410 font-black text-xs py-3.5 rounded-2xl border border-indigo-500 disabled:border-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-md shadow-xs active:scale-98"
                >
                  {mergeStatus === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>差分突合及びマージ中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-white" />
                      <span>一括AIマージを実行（Gemini 3.5）</span>
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Right Workspace Panel: Combined visual output workbench editor and tab controllers */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col h-[660px] shadow-sm text-left">
              
              {/* Tab navigation headers */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 flex-shrink-0">
                <div className="flex gap-2 text-xs bg-slate-100/70 p-1 rounded-xl border border-slate-200/50">
                  <button 
                    onClick={() => setActiveTab("pdf")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeTab === "pdf" ? 'bg-white text-indigo-700 shadow-xxs':'text-slate-410 hover:text-slate-700'}`}
                  >
                    ① PDF OCRテキスト
                  </button>
                  <button 
                    onClick={() => setActiveTab("word")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeTab === "word" ? 'bg-white text-indigo-700 shadow-xxs':'text-slate-410 hover:text-slate-700'}`}
                  >
                    ② Word解析テキスト
                  </button>
                  <button 
                    onClick={() => setActiveTab("merge")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${activeTab === "merge" ? 'bg-white text-indigo-700 shadow-xxs':'text-slate-410 hover:text-slate-700'}`}
                  >
                    <span>③ 成果物・結合プレビュー</span>
                    {mergedText && (
                      <span className="w-1.5 h-1.5 bg-indigo-650 rounded-full animate-ping"></span>
                    )}
                  </button>
                </div>

                {/* Sub control triggers (View Markdown mode vs Edit raw mode) */}
                {activeTab === "merge" && mergedText && (
                  <div className="flex bg-slate-100 p-1 rounded-lg text-[9.5px] font-extrabold select-none">
                    <button 
                      onClick={() => setEditorMode("edit")}
                      className={`px-2 py-1 rounded transition-all cursor-pointer ${editorMode === "edit" ? 'bg-white text-slate-800 shadow-xxs':'text-slate-400 hover:text-slate-700'}`}
                    >
                      Markdown編集
                    </button>
                    <button 
                      onClick={() => setEditorMode("preview")}
                      className={`px-2 py-1 rounded transition-all cursor-pointer ${editorMode === "preview" ? 'bg-white text-slate-800 shadow-xxs':'text-slate-400 hover:text-slate-700'}`}
                    >
                      レンダリング
                    </button>
                  </div>
                )}
              </div>

              {/* Active panel text layout area */}
              <div className="flex-1 overflow-y-auto mt-4 min-h-0 text-left">
                
                {activeTab === "pdf" && (
                  <div className="flex-1 flex flex-col h-full justify-between">
                    <div className="flex-1 flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400 font-mono">
                          {pdfText ? `OCR取得テキスト: ${pdfText.length}文字 (手動編集すると再承認が必要です)` : "PDF (.pdf) ファイルがまだアップロードされていません。"}
                        </span>
                        {pdfText && (
                          <button 
                            onClick={() => { setPdfText(""); }}
                            className="text-[10px] text-red-500 hover:text-red-655 bg-red-50 px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                      {pdfText && countGlossaryMatches(pdfText) > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between shadow-xxs shrink-0"
                        >
                          <span className="text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>検出された誤植表記揺れ <strong>{countGlossaryMatches(pdfText)}件</strong></span>
                          </span>
                          <button
                            onClick={() => handleBatchCorrectCurrentText("pdf")}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95"
                          >
                            辞書ルールで一括置換する
                          </button>
                        </motion.div>
                      )}
                      <textarea
                        value={pdfText}
                        onChange={(e) => { setPdfText(e.target.value); }}
                        placeholder="PDFファイルをアップロードすると、ここに自動解析OCR結果が入ります。直接下書きをコピペすることも可能です。"
                        className="flex-grow w-full bg-slate-50/20 border border-slate-200 rounded-2xl p-4 text-slate-705 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 font-sans leading-relaxed text-sm resize-none h-[380px]"
                      />
                    </div>
                  </div>
                )}

                {activeTab === "word" && (
                  <div className="flex-1 flex flex-col h-full justify-between">
                    <div className="flex-1 flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400 font-mono">
                          {wordText ? `Word取得テキスト: ${wordText.length}文字 (手動編集すると再承認が必要です)` : "Word (.docx) ファイルがまだアップロードされていません。"}
                        </span>
                        {wordText && (
                          <button 
                            onClick={() => { setWordText(""); }}
                            className="text-[10px] text-red-500 hover:text-red-650 bg-red-50 px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                      {wordText && countGlossaryMatches(wordText) > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between shadow-xxs shrink-0"
                        >
                          <span className="text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>登録されたタイポ/表記揺れを <strong>{countGlossaryMatches(wordText)}件</strong> 検出しました</span>
                          </span>
                          <button
                            onClick={() => handleBatchCorrectCurrentText("word")}
                            className="bg-amber-600 hover:bg-amber-750 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95"
                          >
                            辞書ルールへ一括置換する
                          </button>
                        </motion.div>
                      )}
                      <textarea
                        value={wordText}
                        onChange={(e) => { setWordText(e.target.value); }}
                        placeholder="Wordファイルをアップロードすると、ここに自動解析結果が入ります。直接下書きをコピペすることも可能です。"
                        className="flex-grow w-full bg-slate-50/20 border border-slate-200 rounded-2xl p-4 text-slate-705 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 font-sans leading-relaxed text-sm resize-none h-[380px]"
                      />
                    </div>
                  </div>
                )}

                {activeTab === "merge" && (
                  <div className="flex-1 flex flex-col h-full justify-between">
                    {mergedText ? (
                      <div className="flex-1 flex flex-col h-full justify-between">
                        {mergedText && countGlossaryMatches(mergedText) > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between shadow-xxs shrink-0"
                          >
                            <span className="text-[11px] text-amber-800 font-semibold flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>結合・推敲テキスト内に辞書表記揺れを <strong>{countGlossaryMatches(mergedText)}件</strong> 検出しました</span>
                            </span>
                            <button
                              onClick={() => handleBatchCorrectCurrentText("merge")}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95"
                            >
                              登録用語に一括置換する
                            </button>
                          </motion.div>
                        )}
                        <div className="flex-grow flex flex-col h-full min-h-0">
                          {editorMode === "edit" ? (
                            <textarea
                              value={mergedText}
                              onChange={(e) => { setMergedText(e.target.value); }}
                              placeholder="結合結果の原稿です。マークダウン形式で直接編集が可能です。"
                              className="flex-grow w-full bg-slate-50/10 border border-slate-200 rounded-2xl p-4 text-slate-750 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 font-mono leading-relaxed text-sm resize-none h-[380px]"
                            />
                          ) : (
                            <div className="flex-grow w-full border border-slate-200 bg-slate-50/20 rounded-2xl p-5 overflow-y-auto h-[380px] text-left">
                              <div className="prose max-w-none text-slate-800 animate-fade-in">
                                {renderDocumentPreview(mergedText)}
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    ) : (
                      <div className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50/30 text-center py-20">
                        <Compass className="w-12 h-12 text-slate-350 mb-3 animate-pulse" />
                        <h3 className="text-sm font-bold text-slate-705">結合ドキュメントの生成先</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed font-semibold">
                          PDF OCR結果とWord解析原稿の両方をアップロードしたのち、「原稿をAIマージ（Gemini 3.5）」ボタンをクリックするとここに自動合成された成果物が表示されます。
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Export to Google Docs - Bottom Bar Area (Only shown when Merged document exits) */}
              {mergedText && (
                <div className="bg-slate-50/80 p-4 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 mt-3 rounded-2xl">
                  
                  {/* Document name configuration */}
                  <div className="flex-1 text-left">
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">
                      エクスポート先: ファイル名
                    </label>
                    <input 
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="ドキュメントのタイトルを入力..."
                      className="w-full text-xs font-bold text-slate-800 border border-slate-200 rounded-lg p-2.5 bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all shadow-xs"
                    />
                  </div>

                  {/* Action buttons or generated document link */}
                  <div className="flex items-center gap-3 shrink-0">
                    {docStatus === "completed" && createdDocUrl ? (
                      <motion.a
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        href={createdDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl border border-indigo-700 transition-all shadow-md cursor-pointer animate-bounce hover:animate-none"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Google ドキュメントで開く</span>
                      </motion.a>
                    ) : (
                      <button
                        onClick={handleExportToGoogleDocs}
                        disabled={docStatus === "creating" || needsAuth}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-202 text-white disabled:text-slate-400 font-bold text-xs px-5 py-2.5 rounded-xl border border-indigo-500 disabled:border-slate-200 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
                      >
                        {docStatus === "creating" ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Google Doc 作成中...</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4 text-white" />
                            <span>Google Doc に新規保存</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </main>

      {/* Footer Design */}
      <footer className="bg-white border-t border-slate-200 py-3.5 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-slate-500 text-[10px] font-medium leading-normal">
          <div className="flex items-center gap-1.5 font-medium italic">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            System Status: All Engines Operational
          </div>
          <p className="text-slate-400">MergeDoc v4.1.0 • Node: JP-TYO-02</p>
        </div>
      </footer>

    </div>
  );
}
