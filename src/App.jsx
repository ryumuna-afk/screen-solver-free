import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Camera,
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

const MODEL_OPTIONS = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    desc: '빠른 속도 · 가성비 추천 (문제당 약 1~2원)',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
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

  // 개인 API 키 설정 (브라우저에 영구 저장)
  const [showSettings, setShowSettings] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(() => localStorage.getItem('use_custom_key') === 'true');
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('custom_api_key') || '');
  const [customModel, setCustomModel] = useState(() => localStorage.getItem('custom_model') || 'gemini-2.5-pro');
  const [settingsError, setSettingsError] = useState('');

  // 풀이 상태
  const [autoSolve, setAutoSolve] = useState(true);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [answer, setAnswer] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // 화면 캡처 & 드래그 자르기
  const [captureSrc, setCaptureSrc] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragRect, setDragRect] = useState(null);
  const captureImgRef = useRef(null);

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
    (dataUrl) => {
      setImageDataUrl(dataUrl);
      setError('');
      if (autoSolve) solveProblem(dataUrl);
    },
    [autoSolve, solveProblem]
  );

  useEffect(() => {
    if (!isUnlocked || captureSrc || showSettings) return;

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => handleImageReady(ev.target.result);
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isUnlocked, captureSrc, showSettings, handleImageReady]);

  const startScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => setTimeout(r, 150));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      stream.getTracks().forEach((t) => t.stop());

      setCaptureSrc(canvas.toDataURL('image/png'));
      setDragRect(null);
    } catch {
      // 캡처 취소 시 무시
    }
  };

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
    handleImageReady(croppedUrl);
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
      {/* 상단 바 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={startScreenCapture}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
          >
            <Camera className="w-4 h-4" />
            화면 캡처
          </button>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSolve}
              onChange={(e) => setAutoSolve(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded"
            />
            붙여넣기 즉시 풀이
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
        <section className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">문제 이미지</h2>
            {imageDataUrl && (
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
            )}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => handleImageReady(ev.target.result);
                reader.readAsDataURL(file);
              }
            }}
            className="flex-1 min-h-[400px] border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-4 overflow-hidden"
          >
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="캡처된 문제" className="max-h-[65vh] object-contain rounded-lg" />
            ) : (
              <div className="text-center text-slate-500 space-y-2">
                <ClipboardPaste className="w-10 h-10 mx-auto text-slate-400" />
                <p className="font-medium text-slate-700">여기에 Ctrl + V 로 붙여넣기</p>
                <p className="text-xs text-slate-400">
                  상단 [화면 캡처] 버튼 또는 Win + Shift + S 캡처 후 바로 붙여넣으세요
                </p>
              </div>
            )}
          </div>
        </section>

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

          <div className="flex-1 min-h-[400px] overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-100">
            {loading && (
              <div className="h-full flex flex-col items-center justify-center text-indigo-600 gap-2">
                <Loader2 className="w-7 h-7 animate-spin" />
                <p className="text-sm font-medium">문제를 분석하고 있습니다...</p>
              </div>
            )}

            {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200">{error}</div>}

            {!loading && !error && !answer && (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                문제를 붙여넣으면 이곳에 풀이가 표시됩니다.
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

      {/* 무료 / 개인 유료(고성능) 설정 모달 */}
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
              {/* 옵션 1: 무료 모드 */}
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

              {/* 옵션 2: 개인 API 키 */}
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
                  한도 제한 없이 최신 Pro 모델 선택 가능 · 브라우저에 자동 저장
                </div>
              </button>

              {/* 개인 키 상세 입력 영역 */}
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