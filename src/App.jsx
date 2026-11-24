import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Camera,
  Scissors,
  Unplug,
  FileText,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Settings,
  Sparkles,
  Copy,
  Check,
  Lock,
  X,
  Loader2,
  Trash2,
  ExternalLink,
  KeyRound,
} from 'lucide-react';

// Vite 환경에서 PDF.js 워커 연결
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const MODEL_OPTIONS = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    desc: '가장 빠르고 저렴한 모델 · 일상 문제 풀이 추천',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    desc: '속도와 정확도의 균형 · 범용 추천',
  },
  {
    id: 'gemini-3.5-pro',
    name: 'Gemini 3.5 Pro',
    desc: '고난도 수학·과학·심화 추론 최상위 정확도',
  },
];

function compressImage(dataUrl, maxWidth = 1280) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

export default function App() {
  // 비밀번호 인증
  const [password, setPassword] = useState(() => sessionStorage.getItem('access_pw') || '');
  const [isUnlocked, setIsUnlocked] = useState(() => !!sessionStorage.getItem('access_pw'));
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  // 개인 API 키 설정
  const [showSettings, setShowSettings] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(() => localStorage.getItem('use_custom_key') === 'true');
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('custom_api_key') || '');
  const [customModel, setCustomModel] = useState(() => localStorage.getItem('custom_model') || 'gemini-3.5-flash');
  const [settingsError, setSettingsError] = useState('');

  // 풀이 상태
  const [autoSolve, setAutoSolve] = useState(true);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [answer, setAnswer] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // 1번 기능: 화면 연결 유지
  const [isScreenConnected, setIsScreenConnected] = useState(false);
  const streamRef = useRef(null);
  const hiddenVideoRef = useRef(null);

  // 캡처 모달 자르기 상태
  const [captureSrc, setCaptureSrc] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragRect, setDragRect] = useState(null);
  const captureImgRef = useRef(null);

  // 2번 기능: 내장 PDF 뷰어 상태
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfPageNum, setPdfPageNum] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfDragStart, setPdfDragStart] = useState(null);
  const [pdfDragRect, setPdfDragRect] = useState(null);
  const pdfCanvasRef = useRef(null);
  const pdfRenderTaskRef = useRef(null);
  const pdfFileInputRef = useRef(null);

  // 비밀번호 확인
  const handleUnlock = async (e) => {
    e.preventDefault();
    setPwError('');
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwInput }),
      });
      if (res.ok) {
        sessionStorage.setItem('access_pw', pwInput);
        setPassword(pwInput);
        setIsUnlocked(true);
      } else {
        const data = await res.json();
        setPwError(data.error || '비밀번호가 틀렸습니다.');
      }
    } catch {
      setPwError('서버와 연결할 수 없습니다.');
    }
  };

  const handleSaveSettings = () => {
    if (useCustomKey && !customApiKey.trim()) {
      setSettingsError('개인 API 키를 입력해 주세요.');
      return;
    }
    setSettingsError('');
    localStorage.setItem('use_custom_key', String(useCustomKey));
    localStorage.setItem('custom_api_key', customApiKey.trim());
    localStorage.setItem('custom_model', customModel);
    setShowSettings(false);
  };

  // AI 문제 풀이 요청
  const solveProblem = useCallback(
    async (targetDataUrl) => {
      const src = targetDataUrl || imageDataUrl;
      if (!src) return;

      setLoading(true);
      setError('');
      setAnswer('');

      try {
        const compressed = await compressImage(src);
        const base64 = compressed.split(',')[1];

        const res = await fetch('/api/solve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-password': password,
          },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: 'image/jpeg',
            customApiKey: useCustomKey ? customApiKey : '',
            customModel: useCustomKey ? customModel : '',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            sessionStorage.removeItem('access_pw');
            setIsUnlocked(false);
          }
          throw new Error(data.error || '풀이에 실패했습니다.');
        }

        setAnswer(data.answer);
        setUsedModel(data.model);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [imageDataUrl, password, useCustomKey, customApiKey, customModel]
  );

  const handleImageReady = useCallback(
    (dataUrl, keepPdfOpen = false) => {
      if (!keepPdfOpen) {
        setPdfDoc(null);
      }
      setImageDataUrl(dataUrl);
      setError('');
      if (autoSolve) solveProblem(dataUrl);
    },
    [autoSolve, solveProblem]
  );

  // 전역 Ctrl+V 붙여넣기
  useEffect(() => {
    if (!isUnlocked || captureSrc || showSettings) return;

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => handleImageReady(ev.target.result, false);
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isUnlocked, captureSrc, showSettings, handleImageReady]);

  // --- [1번 기능] 화면 연결 유지 및 즉시 자르기 ---
  const disconnectScreen = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.srcObject = null;
    }
    setIsScreenConnected(false);
  }, []);

  useEffect(() => {
    return () => disconnectScreen();
  }, [disconnectScreen]);

  const grabCurrentFrame = () => {
    const video = hiddenVideoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    setCaptureSrc(canvas.toDataURL('image/png'));
    setDragRect(null);
  };

  const connectScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' },
        audio: false,
      });

      streamRef.current = stream;
      const video = hiddenVideoRef.current;
      video.srcObject = stream;
      await video.play();

      // 브라우저 기본 '공유 중지' 버튼 클릭 시 자동 정리
      stream.getVideoTracks()[0].onended = () => {
        disconnectScreen();
      };

      setIsScreenConnected(true);

      // 연결 직후 바로 첫 번째 자르기 창 열기
      setTimeout(() => grabCurrentFrame(), 150);
    } catch {
      // 사용자가 취소한 경우 무시
    }
  };

  // 캡처 모달 드래그 자르기
  const handleMouseDown = (e) => {
    const rect = captureImgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragStart({ x, y });
    setDragRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!dragStart) return;
    const rect = captureImgRef.current.getBoundingClientRect();
    const curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setDragRect({
      x: Math.min(dragStart.x, curX),
      y: Math.min(dragStart.y, curY),
      w: Math.abs(curX - dragStart.x),
      h: Math.abs(curY - dragStart.y),
    });
  };

  const handleMouseUp = () => {
    if (!dragStart || !dragRect || dragRect.w < 15 || dragRect.h < 15) {
      setDragStart(null);
      setDragRect(null);
      return;
    }

    const img = captureImgRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.width = dragRect.w * scaleX;
    canvas.height = dragRect.h * scaleY;
    canvas
      .getContext('2d')
      .drawImage(
        img,
        dragRect.x * scaleX,
        dragRect.y * scaleY,
        dragRect.w * scaleX,
        dragRect.h * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

    const croppedUrl = canvas.toDataURL('image/png');
    setCaptureSrc(null);
    setDragStart(null);
    setDragRect(null);
    handleImageReady(croppedUrl, false);
  };

  // --- [2번 기능] PDF 열기, 렌더링, 바로 드래그해서 풀기 ---
  const loadPdfFile = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(loadedPdf);
      setPdfNumPages(loadedPdf.numPages);
      setPdfPageNum(1);
      setPdfFileName(file.name);
      setImageDataUrl(null);
      setError('');
    } catch {
      setError('PDF 파일을 불러오지 못했습니다. 암호가 걸려 있거나 손상된 파일인지 확인해 주세요.');
    }
  };

  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return;

    let cancelled = false;
    const renderPage = async () => {
      if (pdfRenderTaskRef.current) {
        try {
          pdfRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }

      const page = await pdfDoc.getPage(pdfPageNum);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = pdfCanvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      });
      pdfRenderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch {
        // 렌더링 취소 시 무시
      }
    };

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pdfPageNum]);

  const handlePdfMouseDown = (e) => {
    const rect = pdfCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPdfDragStart({ x, y });
    setPdfDragRect({ x, y, w: 0, h: 0 });
  };

  const handlePdfMouseMove = (e) => {
    if (!pdfDragStart) return;
    const rect = pdfCanvasRef.current.getBoundingClientRect();
    const curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setPdfDragRect({
      x: Math.min(pdfDragStart.x, curX),
      y: Math.min(pdfDragStart.y, curY),
      w: Math.abs(curX - pdfDragStart.x),
      h: Math.abs(curY - pdfDragStart.y),
    });
  };

  const handlePdfMouseUp = () => {
    if (!pdfDragStart || !pdfDragRect || pdfDragRect.w < 15 || pdfDragRect.h < 15) {
      setPdfDragStart(null);
      setPdfDragRect(null);
      return;
    }

    const srcCanvas = pdfCanvasRef.current;
    const scaleX = srcCanvas.width / srcCanvas.clientWidth;
    const scaleY = srcCanvas.height / srcCanvas.clientHeight;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = pdfDragRect.w * scaleX;
    cropCanvas.height = pdfDragRect.h * scaleY;
    cropCanvas
      .getContext('2d')
      .drawImage(
        srcCanvas,
        pdfDragRect.x * scaleX,
        pdfDragRect.y * scaleY,
        pdfDragRect.w * scaleX,
        pdfDragRect.h * scaleY,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );

    const croppedUrl = cropCanvas.toDataURL('image/png');
    setPdfDragStart(null);
    setPdfDragRect(null);
    // PDF 화면은 유지한 채 바로 풀이 요청
    handleImageReady(croppedUrl, true);
  };

  const copyAnswer = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <form onSubmit={handleUnlock} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm">
          <div className="flex items-center gap-2 text-slate-800 mb-6">
            <Lock className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold">화면 문제 풀이</h1>
          </div>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="접속 비밀번호 입력"
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
            autoFocus
          />
          {pwError && <p className="text-sm text-red-500 mb-3">{pwError}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition"
          >
            입장하기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 화면 공유 스트림 유지용 숨김 비디오 */}
      <video ref={hiddenVideoRef} autoPlay playsInline muted className="hidden" />

      {/* 숨김 PDF 파일 입력 */}
      <input
        ref={pdfFileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadPdfFile(file);
          e.target.value = '';
        }}
      />

      {/* 상단 바 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {!isScreenConnected ? (
            <button
              onClick={connectScreen}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
            >
              <Camera className="w-4 h-4" />
              화면 연결
            </button>
          ) : (
            <>
              <button
                onClick={grabCurrentFrame}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
              >
                <Scissors className="w-4 h-4" />
                지금 화면 자르기
              </button>
              <button
                onClick={disconnectScreen}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-sm font-medium rounded-xl transition"
                title="화면 공유 연결 끊기"
              >
                <Unplug className="w-4 h-4" />
                연결 끊기
              </button>
            </>
          )}

          <button
            onClick={() => pdfFileInputRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-sm font-medium rounded-xl transition"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            PDF 열기
          </button>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none ml-1">
            <input
              type="checkbox"
              checked={autoSolve}
              onChange={(e) => setAutoSolve(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded"
            />
            즉시 풀이
          </label>
        </div>

        <button
          onClick={() => {
            setSettingsError('');
            setShowSettings(true);
          }}
          className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl border transition ${
            useCustomKey
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {useCustomKey ? <KeyRound className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          <span>{useCustomKey ? `내 키 사용 중 (${customModel.replace('gemini-', '')})` : '무료 모드'}</span>
        </button>
      </header>

      {/* 메인 좌우 2단 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 왼쪽: PDF 뷰어 또는 이미지 붙여넣기 박스 */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-semibold text-slate-800 truncate">
              {pdfDoc ? `PDF: ${pdfFileName}` : '문제 이미지'}
            </h2>

            {pdfDoc ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setPdfPageNum((p) => Math.max(1, p - 1))}
                  disabled={pdfPageNum <= 1}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-slate-600 min-w-[48px] text-center">
                  {pdfPageNum} / {pdfNumPages}
                </span>
                <button
                  onClick={() => setPdfPageNum((p) => Math.min(pdfNumPages, p + 1))}
                  disabled={pdfPageNum >= pdfNumPages}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setPdfDoc(null);
                    setPdfFileName('');
                  }}
                  className="ml-1 px-2.5 py-1 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  닫기
                </button>
              </div>
            ) : (
              imageDataUrl && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => solveProblem(imageDataUrl)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold rounded-lg transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    다시 풀기
                  </button>
                  <button
                    onClick={() => {
                      setImageDataUrl(null);
                      setAnswer('');
                      setError('');
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"
                    title="지우기"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            )}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              if (file.type === 'application/pdf') {
                loadPdfFile(file);
              } else if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => handleImageReady(ev.target.result, false);
                reader.readAsDataURL(file);
              }
            }}
            className="flex-1 min-h-[420px] max-h-[75vh] border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-auto relative flex flex-col items-center justify-start p-3"
          >
            {pdfDoc ? (
              <div className="w-full flex flex-col items-center select-none">
                <p className="text-xs text-indigo-600 font-medium mb-2">
                  풀고 싶은 문제 위를 마우스로 드래그하면 바로 풀이가 시작됩니다
                </p>
                <div className="relative inline-block cursor-crosshair shadow-sm bg-white">
                  <canvas
                    ref={pdfCanvasRef}
                    onMouseDown={handlePdfMouseDown}
                    onMouseMove={handlePdfMouseMove}
                    onMouseUp={handlePdfMouseUp}
                    className="max-w-full h-auto block"
                  />
                  {pdfDragRect && (
                    <div
                      style={{
                        left: pdfDragRect.x,
                        top: pdfDragRect.y,
                        width: pdfDragRect.w,
                        height: pdfDragRect.h,
                      }}
                      className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none"
                    />
                  )}
                </div>
              </div>
            ) : imageDataUrl ? (
              <div className="my-auto">
                <img src={imageDataUrl} alt="캡처된 문제" className="max-h-[68vh] object-contain rounded-lg" />
              </div>
            ) : (
              <div className="my-auto text-center text-slate-500 space-y-2 px-4">
                <ClipboardPaste className="w-10 h-10 mx-auto text-slate-400" />
                <p className="font-medium text-slate-700">여기에 Ctrl + V 또는 PDF 파일 드래그</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  • 상단 [화면 연결]로 다른 창을 한 번 연결해 두고 계속 자르기
                  <br />
                  • PDF 문제집을 끌어다 놓고 문제 위를 바로 드래그하기
                  <br />• Win + Shift + S 캡처 후 Ctrl + V 붙여넣기
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 오른쪽: AI 해설 출력창 */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-800">AI 풀이</h2>
              {usedModel && (
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{usedModel}</span>
              )}
            </div>
            {answer && (
              <button
                onClick={copyAnswer}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사됨' : '복사'}
              </button>
            )}
          </div>

          <div className="flex-1 min-h-[420px] max-h-[75vh] overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-100">
            {loading && (
              <div className="h-full flex flex-col items-center justify-center text-indigo-600 gap-2">
                <Loader2 className="w-7 h-7 animate-spin" />
                <p className="text-sm font-medium">문제를 분석하고 있습니다...</p>
              </div>
            )}

            {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200">{error}</div>}

            {!loading && !error && !answer && (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                문제를 드래그하거나 붙여넣으면 이곳에 풀이가 표시됩니다.
              </div>
            )}

            {!loading && answer && (
              <div className="space-y-3 text-sm text-slate-800 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {answer}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 화면 캡처 드래그 자르기 모달 */}
      {captureSrc && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 select-none">
          <div className="mb-3 flex items-center gap-4 text-white text-sm">
            <span>풀고 싶은 문제 영역을 마우스로 드래그하세요</span>
            <button
              onClick={() => setCaptureSrc(null)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg"
            >
              취소
            </button>
          </div>
          <div className="relative inline-block cursor-crosshair max-w-full max-h-[85vh] overflow-hidden">
            <img
              ref={captureImgRef}
              src={captureSrc}
              alt="화면 캡처"
              draggable={false}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="max-w-full max-h-[85vh] block"
            />
            {dragRect && (
              <div
                style={{
                  left: dragRect.x,
                  top: dragRect.y,
                  width: dragRect.w,
                  height: dragRect.h,
                }}
                className="absolute border-2 border-indigo-400 bg-indigo-500/20 pointer-events-none"
              />
            )}
          </div>
        </div>
      )}

      {/* 무료 / 개인 유료 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-lg">AI 사용 모드 설정</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setUseCustomKey(false);
                  setSettingsError('');
                }}
                className={`w-full text-left p-4 rounded-xl border-2 transition ${
                  !useCustomKey
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-800 text-sm">기본 무료 모드</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  별도 설정 없이 바로 사용 (일일 무료 한도 내 동작)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUseCustomKey(true)}
                className={`w-full text-left p-4 rounded-xl border-2 transition ${
                  useCustomKey
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-800 text-sm">내 API 키로 고성능 모드 (유료/개인)</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  한도 제한 없이 최신 모델 선택 가능 · 브라우저에 자동 저장
                </div>
              </button>

              {useCustomKey && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 mt-2">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">Gemini API 키</label>
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        키 발급받기 <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={customApiKey}
                      onChange={(e) => {
                        setCustomApiKey(e.target.value);
                        setSettingsError('');
                      }}
                      placeholder="AIzaSy... 로 시작하는 키 붙여넣기"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      입력한 키는 서버에 저장되지 않고 내 브라우저에만 보관됩니다.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">AI 모델 선택</label>
                    <div className="space-y-2">
                      {MODEL_OPTIONS.map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer bg-white ${
                            customModel === m.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="customModel"
                            checked={customModel === m.id}
                            onChange={() => setCustomModel(m.id)}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <div>
                            <div className="text-xs font-semibold text-slate-800">{m.name}</div>
                            <div className="text-[11px] text-slate-500">{m.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {settingsError && <p className="text-xs text-red-500">{settingsError}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                취소
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
