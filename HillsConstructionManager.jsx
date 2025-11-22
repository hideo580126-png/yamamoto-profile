import React, { useState, useEffect, useMemo } from 'react';
import { Hammer, ClipboardList, CheckCircle, AlertTriangle, Package, XCircle, MapPin, Users, RotateCcw, Wifi, WifiOff, Loader2, Mail, MessageCircle, Sparkles, X, Copy, ChevronRight } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';

// --- Firebase設定 ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Gemini API設定 ---
const apiKey = ""; // 環境変数から自動注入されます

const openExternalLink = (url) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noreferrer';
  anchor.target = '_blank';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const launchLineWithFallback = (text) => {
  const encoded = encodeURIComponent(text);
  const lineShareUrl = `https://line.me/R/msg/text/?${encoded}`;
  const intentUrl = `intent://msg/text/${encoded}#Intent;scheme=line;package=jp.naver.line.android;end`;

  // AndroidではLINEアプリのインテントを試し、失敗した場合はWeb版にフォールバック
  if (/android/i.test(navigator.userAgent)) {
    openExternalLink(intentUrl);
    setTimeout(() => openExternalLink(lineShareUrl), 400);
  } else {
    openExternalLink(lineShareUrl);
  }
};

const HillsConstructionManager = () => {
  const [filter, setFilter] = useState('all');
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('connecting'); 
  const [showCelebration, setShowCelebration] = useState(false);
  
  // AI日報作成用のState
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // ハプティックフィードバック（スマホがブルッと震える）
  const triggerHaptic = () => {
    if (navigator.vibrate) {
      navigator.vibrate(10); // 10msの微弱な振動
    }
  };

  // 初期データ
  const initialRoomsData = [
    { id: 'C103', priority: '高', status: '要施工', task: '壁ボード貼り・トイレ復旧', detail: '【ファイル名確認済】断熱材剥き出し部分のボード施工。便器が外されているため床下地調整と復旧。', icon: 'hammer', completed: false },
    { id: 'C101', priority: '高', status: '要施工', task: '壁ボード貼り・資材整理', detail: '【ファイル名確認済】リビング窓周りのボード貼り。キッチンに山積みの資材（木材・断熱材）を使用・整理してください。', icon: 'hammer', completed: false },
    { id: 'A105', priority: '高', status: '要施工', task: '壁ボード・床下地確認', detail: '窓周り・部屋角のボード貼り。床の汚れが酷いため、上張り等の下地確認。', icon: 'hammer', completed: false },
    { id: 'A205', priority: '中', status: '要施工', task: '窓周りボード貼り', detail: '【養生済み】残置物なし。作業環境良好。断熱材部分のボード貼り。', icon: 'check-circle', completed: false },
    { id: 'B102', priority: 'お任せ', status: '現場判断', task: '窓取付（在庫サッシ）', detail: '在庫のサッシ（4枚程度）を使って取り付けお願いします。施工順序は皆さんにお任せします。', icon: 'users', completed: false },
    { id: 'A103', priority: '低', status: '片付け', task: '残置物（ゴミ）撤去', detail: '大工工事なし。玄関・キッチンの段ボールゴミ撤去のみ。', icon: 'trash', completed: false },
    { id: 'A202', priority: '-', status: '完了', task: '作業なし', detail: '大工工事はありません。', icon: 'x-circle', completed: true },
  ];

  // 1. 認証
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth failed", error);
        setSyncStatus('error');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. データ同期
  useEffect(() => {
    if (!user) return;
    const collectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'hills-construction-v2');
    const unsubscribe = onSnapshot(collectionRef, async (snapshot) => {
      if (snapshot.empty) {
        const batch = writeBatch(db);
        initialRoomsData.forEach((room) => {
          const docRef = doc(collectionRef, room.id);
          batch.set(docRef, room);
        });
        await batch.commit();
      } else {
        const roomList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const priorityOrder = { '高': 1, '中': 2, 'お任せ': 3, '低': 4, '-': 5 };
        roomList.sort((a, b) => {
           const pA = priorityOrder[a.priority] || 99;
           const pB = priorityOrder[b.priority] || 99;
           return pA - pB;
        });
        setRooms(roomList);
        setLoading(false);
        setSyncStatus('synced');
      }
    }, (error) => {
      console.error("Sync failed", error);
      setSyncStatus('error');
    });
    return () => unsubscribe();
  }, [user]);

  // 完了切り替え
  const toggleComplete = async (room) => {
    triggerHaptic();
    if (!user || room.id === 'A202') return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'hills-construction-v2', room.id);
    try {
      if (!room.completed) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2500); 
      }
      await updateDoc(docRef, { completed: !room.completed });
    } catch (error) {
      console.error("Update failed", error);
      alert("通信エラー");
    }
  };

  // AI日報生成ロジック
  const generateReport = async () => {
    triggerHaptic();
    setIsGenerating(true);
    setShowReportModal(true);
    setReportText("Geminiが日報を作成中...");

    const completedRooms = rooms.filter(r => r.completed && r.id !== 'A202').map(r => `${r.id} (${r.task})`);
    const remainingRooms = rooms.filter(r => !r.completed).map(r => `${r.id} (${r.task})`);
    
    const today = new Date().toLocaleDateString('ja-JP');

    const prompt = `
      あなたは建設現場の職長です。以下の作業状況を元に、社長への「本日の作業日報」を作成してください。
      
      【日付】${today}
      【現場名】ヒルズいとう
      【完了した作業】
      ${completedRooms.length > 0 ? completedRooms.join('\n') : '特になし'}
      
      【残作業】
      ${remainingRooms.length > 0 ? remainingRooms.join('\n') : '特になし'}
      
      【条件】
      - 礼儀正しく、簡潔なビジネス文章にしてください。
      - 冒頭は「お疲れ様です。本日のヒルズいとうの作業報告です。」で始めてください。
      - 最後に「明日もよろしくお願いします。」で締めてください。
      - 絵文字は控えめに、読みやすさ重視で。
    `;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "生成に失敗しました。";
      setReportText(text);

    } catch (error) {
      console.error("Gemini API Error:", error);
      setReportText("申し訳ありません。AIによる生成に失敗しました。\n手動で入力をお願いします。");
    } finally {
      setIsGenerating(false);
    }
  };

  // 共有アクション
  const shareReportLine = () => {
    triggerHaptic();
    launchLineWithFallback(reportText);
  };

  const shareReportMail = () => {
    triggerHaptic();
    const subject = `【作業日報】ヒルズいとう (${new Date().toLocaleDateString('ja-JP')})`;
    const mailtoLink = `mailto:hideo580126@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportText)}`;
    openExternalLink(mailtoLink);
  };

  const sendMail = (room) => {
    triggerHaptic();
    const subject = `【完了報告】ヒルズいとう ${room.id}`;
    const body = `お疲れ様です。\n\n${room.id}号室（${room.task}）の作業が完了しました。\n確認をお願いします。\n\n--\n現場より`;
    const mailtoLink = `mailto:hideo580126@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    openExternalLink(mailtoLink);
  };

  const sendLine = (room) => {
    triggerHaptic();
    const text = `【完了報告】ヒルズいとう ${room.id}\n${room.task} 完了しました！`;
    launchLineWithFallback(text);
  };

  // フィルタリング
  const filteredRooms = useMemo(() => {
    let targetRooms = rooms;
    if (filter !== 'all') {
      targetRooms = rooms.filter(r => r.priority === filter);
    }
    return [...targetRooms].sort((a, b) => {
      if (a.id === 'A202') return 1;
      if (b.id === 'A202') return -1;
      return a.completed === b.completed ? 0 : a.completed ? 1 : -1;
    });
  }, [filter, rooms]);

  // 進捗計算
  const completedCount = rooms.filter(r => r.completed).length;
  const progress = rooms.length > 0 ? Math.round((completedCount / rooms.length) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 text-slate-500">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="font-bold text-lg">現場データ読込中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-100 min-h-screen pb-28 font-sans text-slate-800 overflow-x-hidden relative shadow-2xl">
      {/* 簡易完了エフェクト */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 pointer-events-none animate-in fade-in duration-200">
          <div className="bg-white/90 backdrop-blur p-8 rounded-3xl shadow-2xl transform animate-bounce text-center border-4 border-yellow-400">
            <div className="text-8xl mb-2">💮</div>
            <div className="font-black text-2xl text-blue-700 tracking-widest">大変よく<br/>できました</div>
          </div>
        </div>
      )}

      {/* ヘッダー（固定） */}
      <div className="bg-gradient-to-b from-blue-900 to-blue-800 text-white p-4 sticky top-0 z-20 shadow-lg rounded-b-xl">
        <div className="flex justify-between items-end mb-3">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight">
              <Hammer className="w-7 h-7 text-yellow-400 fill-current" />
              ヒルズいとう
            </h1>
            <div className="flex items-center gap-2 mt-1 opacity-90">
              <p className="text-xs font-medium bg-blue-950/50 px-2 py-1 rounded">現場指示書 v2.0</p>
              {syncStatus === 'synced' ? (
                <span className="flex items-center gap-1 text-[10px] bg-green-500/30 px-2 py-1 rounded text-green-200 font-bold">
                  <Wifi className="w-3 h-3" /> オンライン
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] bg-red-500/30 px-2 py-1 rounded text-red-200 font-bold">
                  <WifiOff className="w-3 h-3" /> オフライン
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold bg-white/10 px-2 py-1 rounded border border-white/20 text-white/80 block mb-1">社長確認済</span>
            <div className="text-3xl font-black text-yellow-300 leading-none">{progress}<span className="text-sm text-white">%</span></div>
          </div>
        </div>
        
        {/* プログレスバー */}
        <div className="w-full bg-blue-950/50 rounded-full h-3 overflow-hidden backdrop-blur-sm border border-blue-500/30">
          <div 
            className="bg-gradient-to-r from-yellow-300 to-yellow-500 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_15px_rgba(250,204,21,0.6)]" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* フィルター（横スクロール） */}
      <div className="py-3 pl-3 bg-slate-100 sticky top-[110px] z-10 overflow-x-auto flex gap-2 scrollbar-hide mask-linear-fade">
        {['all', '高', '中', 'お任せ', '低'].map(f => (
          <button
            key={f}
            onClick={() => {
              triggerHaptic();
              setFilter(f);
            }}
            className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all active:scale-95 shadow-sm ${
              filter === f 
                ? 'bg-blue-700 text-white shadow-blue-900/30 ring-2 ring-blue-500 ring-offset-2' 
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? 'すべて' : f === 'お任せ' ? '現場判断' : `優先度：${f}`}
          </button>
        ))}
        <div className="w-4 shrink-0" />{/* 右端の余白 */}
      </div>

      {/* ルームリスト */}
      <div className="px-4 pb-4 space-y-4">
        {filteredRooms.map((room) => {
          const isCompleted = room.completed;
          
          return (
            <div 
              key={room.id} 
              className={`bg-white rounded-2xl shadow-sm border-l-[6px] overflow-hidden transition-all duration-300 ${
                isCompleted ? 'border-slate-300 opacity-70 bg-slate-50 grayscale-[0.8]' :
                room.priority === '高' ? 'border-red-500 shadow-red-100' :
                room.priority === '中' ? 'border-yellow-500 shadow-yellow-100' :
                room.priority === 'お任せ' ? 'border-purple-500 shadow-purple-100' :
                room.priority === '低' ? 'border-blue-400 shadow-blue-100' : 'border-slate-300'
              }`}
            >
              <div className="p-5">
                {/* カードヘッダー */}
                <div className="flex justify-between items-start mb-4">
                  <h2 className={`text-3xl font-black flex items-center gap-1 tracking-tight ${isCompleted ? 'text-slate-400 decoration-2 line-through decoration-slate-400' : 'text-slate-800'}`}>
                    <span className="text-lg text-slate-400 font-normal">#</span>
                    {room.id}
                  </h2>
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold text-white shadow-sm ${
                    isCompleted ? 'bg-slate-400' :
                    room.status === '要施工' ? 'bg-red-500 animate-pulse' :
                    room.status === '現場判断' ? 'bg-purple-500' :
                    room.status === '片付け' ? 'bg-blue-500' : 'bg-slate-400'
                  }`}>
                    {isCompleted ? '完了済' : room.status}
                  </span>
                </div>
                
                {/* カード内容 */}
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-2xl flex-shrink-0 shadow-inner ${
                    isCompleted ? 'bg-slate-200 text-slate-400' :
                    room.icon === 'hammer' ? 'bg-red-50 text-red-600' :
                    room.icon === 'users' ? 'bg-purple-50 text-purple-600' :
                    room.icon === 'check-circle' ? 'bg-green-50 text-green-600' :
                    room.icon === 'trash' ? 'bg-blue-50 text-blue-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {room.icon === 'hammer' && <Hammer className="w-8 h-8" />}
                    {room.icon === 'users' && <Users className="w-8 h-8" />}
                    {room.icon === 'check-circle' && <CheckCircle className="w-8 h-8" />}
                    {room.icon === 'trash' && <AlertTriangle className="w-8 h-8" />}
                    {room.icon === 'x-circle' && <XCircle className="w-8 h-8" />}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-xl mb-2 leading-tight ${isCompleted ? 'text-slate-400' : 'text-slate-800'}`}>
                      {room.task}
                    </h3>
                    <p className={`text-sm leading-relaxed ${isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                      {room.detail}
                    </p>
                  </div>
                </div>

                {/* アクションエリア */}
                {room.id !== 'A202' && (
                  <div className="pt-4 border-t border-slate-100 grid grid-cols-1 gap-3">
                    
                    {/* デカい完了ボタン */}
                    <button 
                      onClick={() => toggleComplete(room)}
                      className={`text-base font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] touch-manipulation ${
                        isCompleted 
                          ? 'bg-white text-slate-500 border-2 border-slate-200' 
                          : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-blue-200 hover:shadow-lg'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <RotateCcw className="w-5 h-5" /> 未完了に戻す
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-6 h-6" /> 作業完了！
                        </>
                      )}
                    </button>

                    {/* 報告サブボタン（完了時のみ） */}
                    {isCompleted && (
                      <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-2 duration-300">
                        <button 
                          onClick={() => sendMail(room)}
                          className="bg-slate-50 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:bg-slate-100"
                        >
                          <Mail className="w-4 h-4 text-red-500" /> <span className="text-xs">メール報告</span>
                        </button>
                        <button 
                          onClick={() => sendLine(room)}
                          className="bg-slate-50 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:bg-slate-100"
                        >
                          <MessageCircle className="w-4 h-4 text-green-500" /> <span className="text-xs">LINE報告</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI日報作成ボタン（固定フローティング） */}
      <div className="fixed bottom-6 right-4 left-4 z-40">
        <button 
          onClick={() => {
            triggerHaptic();
            generateReport();
          }}
          className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-bold py-4 px-6 rounded-2xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform border-2 border-white/20 backdrop-blur-sm"
        >
          <div className="relative">
            <Sparkles className="w-6 h-6 text-yellow-300" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </span>
          </div>
          <span className="text-lg">AIで日報を作成する</span>
        </button>
      </div>

      {/* 日報モーダル（スマホ最適化） */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          {/* ボトムシート風デザイン */}
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
            
            {/* ハンドルバー（スマホ用） */}
            <div className="w-full flex justify-center pt-3 pb-1 sm:hidden" onClick={() => setShowReportModal(false)}>
              <div className="w-12 h-1.5 bg-slate-300 rounded-full"></div>
            </div>

            {/* ヘッダー */}
            <div className="px-5 py-3 flex justify-between items-center border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                AI日報生成
              </h3>
              <button 
                onClick={() => setShowReportModal(false)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 本文エリア */}
            <div className="p-5 flex-1 overflow-y-auto min-h-[300px]">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-6 h-full">
                  <div className="relative">
                    <div className="absolute inset-0 bg-purple-100 rounded-full animate-ping opacity-75"></div>
                    <Loader2 className="w-16 h-16 text-purple-600 animate-spin relative z-10" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-700 text-lg mb-1">AIが執筆中...</p>
                    <p className="text-slate-400 text-sm">今日の頑張りをまとめています</p>
                  </div>
                </div>
              ) : (
                <textarea 
                  className="w-full h-full min-h-[250px] p-4 border-2 border-slate-200 rounded-xl text-base leading-relaxed focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none bg-slate-50 text-slate-700 font-medium"
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
              )}
            </div>

            {/* アクションボタン */}
            {!isGenerating && (
              <div className="p-5 border-t border-slate-100 bg-white pb-8 sm:pb-5 flex flex-col gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <button 
                  onClick={() => {
                    triggerHaptic();
                    navigator.clipboard.writeText(reportText);
                    alert('コピーしました！');
                  }}
                  className="w-full bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:bg-slate-200 touch-manipulation"
                >
                  <Copy className="w-5 h-5" /> 文章をコピー
                </button>
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={shareReportMail}
                    className="bg-red-50 text-red-600 border-2 border-red-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:bg-red-100 touch-manipulation"
                  >
                    <Mail className="w-5 h-5" /> メール
                  </button>
                  <button 
                    onClick={shareReportLine}
                    className="bg-[#06C755] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:opacity-90 shadow-lg shadow-green-200 touch-manipulation"
                  >
                    <MessageCircle className="w-5 h-5 fill-white" /> LINEで送る
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HillsConstructionManager;
