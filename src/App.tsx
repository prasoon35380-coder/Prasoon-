/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Cpu, Sparkles, Bot, Mic, MicOff, MessageSquarePlus, Clock, Menu, X, Trophy, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage } from './components/ChatMessage';
import { sendMessageStream } from './services/geminiService';
import { cn } from './lib/utils';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

// Speech recognition setup
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

if (recognition) {
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
}

// Fallback for randomUUID in non-secure contexts
const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15);
  }
};

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [neuralSync, setNeuralSync] = useState(0);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isEditingTitleId, setIsEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editTitleInputRef = useRef<HTMLInputElement>(null);

  const startEditingTitle = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitleId(id);
    setEditingTitleValue(title);
  };

  const saveTitle = (id: string) => {
    if (editingTitleValue.trim()) {
      setSessions(prev => prev.map(s => 
        s.id === id ? { ...s, title: editingTitleValue.trim() } : s
      ));
    }
    setIsEditingTitleId(null);
  };

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('nexus_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to load sessions", e);
      }
    }
  }, []);

  // Save to localStorage when sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('nexus_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSessionId, streamingMessage, sessions]);

  // Sync neural sync level with message count
  useEffect(() => {
    const totalMessages = sessions.reduce((acc, s) => acc + s.messages.length, 0);
    setNeuralSync(Math.min(100, Math.floor(totalMessages / 2)));
  }, [sessions]);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  const createNewSession = () => {
    const newSession: Session = {
      id: generateId(),
      title: 'New Neural Branch',
      messages: [],
      updatedAt: Date.now()
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newSession.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered);
    if (activeSessionId === id) {
      setActiveSessionId(filtered.length > 0 ? filtered[0].id : null);
    }
    if (filtered.length === 0) {
      localStorage.removeItem('nexus_sessions');
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    if (e) e.preventDefault();
    const finalInput = overrideInput || input;
    if (!finalInput.trim() || isLoading) return;

    // Ensure session exists
    let currentId = activeSessionId;
    let currentSessions = [...sessions];
    
    if (!currentId) {
      const newSession: Session = {
        id: crypto.randomUUID(),
        title: finalInput.slice(0, 30) + (finalInput.length > 30 ? '...' : ''),
        messages: [],
        updatedAt: Date.now()
      };
      currentSessions = [newSession, ...sessions];
      setSessions(currentSessions);
      setActiveSessionId(newSession.id);
      currentId = newSession.id;
    }

    const userMessage = finalInput.trim();
    if (!overrideInput) setInput('');
    
    const sessionToUpdate = currentSessions.find(s => s.id === currentId);
    if (!sessionToUpdate) return;

    const newMessages: Message[] = [...sessionToUpdate.messages, { role: 'user', content: userMessage }];
    
    // Update session immediately for UI responsiveness
    setSessions(currentSessions.map(s => 
      s.id === currentId 
        ? { ...s, messages: newMessages, updatedAt: Date.now() }
        : s
    ));

    setIsLoading(true);
    setStreamingMessage('');

    try {
      const stream = await sendMessageStream(newMessages);
      let fullResponse = '';

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          setStreamingMessage(fullResponse);
        }
      }

      setSessions(prev => prev.map(s => 
        s.id === currentId 
          ? { 
              ...s, 
              messages: [...newMessages, { role: 'model', content: fullResponse }],
              title: s.title === 'New Neural Branch' ? userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '') : s.title,
              updatedAt: Date.now() 
            }
          : s
      ));
      setStreamingMessage('');
    } catch (error) {
      console.error('Chat Error:', error);
      const errorMsg = error instanceof Error && error.message.includes("API Key") 
        ? "API Key is missing. Please configure GEMINI_API_KEY in the Secrets panel."
        : "I encountered an error syncronizing with the core. Please verify your connection.";
      
      setSessions(prev => prev.map(s => 
        s.id === currentId 
          ? { ...s, messages: [...newMessages, { role: 'model', content: errorMsg }] }
          : s
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleListening = () => {
    if (!recognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognition.start();
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-slate-200 font-sans selection:bg-cyan-500/30 overflow-hidden relative">
      {/* Atmospheric Background Glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Sidebar - Mobile Toggle overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-80 bg-black/60 backdrop-blur-2xl border-r border-white/10 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 md:bg-black/40",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-purple-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.4)]">
              <Cpu size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Nexus Core</h1>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 text-slate-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 mb-6">
          <button 
            onClick={() => {
              createNewSession();
              setIsSidebarOpen(false);
            }}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 px-4 text-sm font-medium flex items-center justify-between transition-all text-slate-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] group"
          >
            <div className="flex items-center gap-2">
              <MessageSquarePlus size={18} className="text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>New Session</span>
            </div>
            <kbd className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded opacity-50 font-mono">⌘ N</kbd>
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-4 px-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Neural Memory</p>
            <Clock size={12} className="text-slate-600" />
          </div>
          
          <AnimatePresence mode="popLayout">
            {sessions.map((session) => (
              <motion.div
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={session.id}
                onClick={() => {
                  if (activeSessionId !== session.id) {
                    setActiveSessionId(session.id);
                    setIsSidebarOpen(false);
                  }
                }}
                className={cn(
                  "group relative p-3 rounded-xl cursor-pointer transition-all border",
                  activeSessionId === session.id 
                    ? "bg-white/10 border-white/20 shadow-lg" 
                    : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                )}
              >
                <div className="flex flex-col gap-1 pr-14">
                  {isEditingTitleId === session.id ? (
                    <input
                      ref={editTitleInputRef}
                      autoFocus
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onBlur={() => saveTitle(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTitle(session.id);
                        if (e.key === 'Escape') setIsEditingTitleId(null);
                      }}
                      className="bg-black/40 border border-cyan-500/50 rounded px-1.5 py-0.5 text-sm text-white outline-none w-full"
                    />
                  ) : (
                    <p className={cn(
                      "text-sm font-medium truncate transition-colors",
                      activeSessionId === session.id ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                    )}>
                      {session.title}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-600 font-mono">
                    {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => startEditingTitle(session.id, session.title, e)}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-cyan-400 transition-colors"
                  >
                    <Sparkles size={12} />
                  </button>
                  <button
                    onClick={(e) => deleteSession(session.id, e)}
                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {activeSessionId === session.id && (
                  <motion.div 
                    layoutId="active-indicator"
                    className="absolute left-[-4px] top-1/4 bottom-1/4 w-[2px] bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]"
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {sessions.length === 0 && (
            <div className="px-4 py-12 text-center border-2 border-dashed border-white/5 rounded-2xl">
              <p className="text-xs text-slate-600 italic">No neural branches active. Start a new session to begin synchronization.</p>
            </div>
          )}
        </nav>

        <div className="p-4 bg-gradient-to-t from-black/80 to-transparent mt-auto sticky bottom-0 space-y-4">
          {/* Gamified Neural Level */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-125 transition-transform">
               <Trophy size={32} className="text-yellow-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-yellow-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Neural Proficiency</span>
              </div>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-2xl font-black text-white italic">LVL {Math.floor(neuralSync / 10) + 1}</span>
                <span className="text-[10px] text-slate-500 mb-1">Rank: {neuralSync > 50 ? 'Architect' : 'Novice'}</span>
              </div>
              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${neuralSync % 100}%` }}
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-600"
                />
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-[9px] text-slate-600 font-mono italic">Sync Rate: {neuralSync}%</span>
                <span className="text-[9px] text-slate-600 font-mono italic">Next: {100 - (neuralSync % 100)}%</span>
              </div>
            </div>
          </div>

          <div className={cn(
            "p-4 rounded-xl border transition-all backdrop-blur-xl",
            process.env.GEMINI_API_KEY ? "bg-emerald-900/10 border-emerald-500/20" : "bg-red-900/10 border-red-500/20"
          )}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                process.env.GEMINI_API_KEY ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" : "bg-red-500"
              )}></div>
              <p className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                process.env.GEMINI_API_KEY ? "text-emerald-400" : "text-red-400"
              )}>{process.env.GEMINI_API_KEY ? "Engine Prime" : "Engine Halted"}</p>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-mono">Sync: {process.env.GEMINI_API_KEY ? "Verified" : "Pending Key"}</span>
              <div className="w-16 h-1 bg-black/40 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: process.env.GEMINI_API_KEY ? '100%' : '10%' }}
                  className={cn(
                    "h-full shadow-lg transition-all duration-1000",
                    process.env.GEMINI_API_KEY ? "bg-cyan-500 shadow-cyan-500/50" : "bg-red-500 shadow-red-500/50"
                  )}
                ></motion.div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Workspace */}
      <main className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-white/10 flex items-center justify-between px-4 md:px-10 backdrop-blur-md bg-black/20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:text-white"
            >
              <Menu size={24} />
            </button>
            <div className="flex gap-2 items-center overflow-hidden shrink min-w-0">
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded shrink-0">BETA_V1</span>
              <span className="text-sm font-semibold tracking-wide truncate uppercase">
                {activeSession?.title || 'System Standby'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <button 
              onClick={createNewSession}
              className="p-2 md:hidden text-cyan-400 hover:bg-cyan-400/10 rounded-lg"
              title="New Session"
            >
              <MessageSquarePlus size={20} />
            </button>
            <button className="flex items-center gap-3 bg-white text-black text-[10px] md:text-xs font-black px-4 md:px-6 py-2.5 md:py-3 rounded-full hover:bg-slate-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] group">
              <Sparkles size={16} className="text-purple-600 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">NEXUS PRO</span>
              <span className="sm:hidden">PRO</span>
            </button>
          </div>
        </header>

        {/* Content Viewport */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-10 scroll-smooth custom-scrollbar"
        >
          <div className="max-w-4xl mx-auto w-full flex flex-col min-h-full">
            {messages.length === 0 && !streamingMessage ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-16 py-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-cyan-500/20 blur-[50px] rounded-full"></div>
                    <div className="relative w-32 h-32 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-2xl overflow-hidden group">
                      <Bot size={64} className="text-white group-hover:scale-110 transition-transform" />
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <Zap size={32} className="text-white animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-5xl font-black tracking-tight text-white mt-8 leading-[1.1]">Nexus Learning</h2>
                    <p className="text-slate-500 max-w-lg mx-auto text-lg leading-relaxed font-medium capitalize">
                      Sync with the core to increase your neural proficiency.
                    </p>
                  </div>
                </motion.div>
                               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-5xl">
                  {[
                    { title: "Technical Architecture", desc: "Scalable systems & local infrastructure design", icon: "🏗️" },
                    { title: "Code Optimization", desc: "Logic analysis, debugging & neural refactoring", icon: "⚡" },
                    { title: "Creative Composition", desc: "Professional writing, technical proposals & narratives", icon: "✍️" },
                    { title: "General Knowledge", desc: "Factual inquiries across science, history & art", icon: "🌍" },
                    { title: "Strategic Logic", desc: "Business strategy & high-level decision frameworks", icon: "📈" }
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={() => handleSubmit(undefined, `Analyze this context in ${item.title}: `)}
                      className="text-left p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-cyan-500/50 transition-all hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl grayscale group-hover:grayscale-0 group-hover:opacity-40 transition-all">
                        {item.icon}
                      </div>
                      <div className="relative z-10">
                        <p className="text-base font-bold text-white mb-1">{item.title}</p>
                        <p className="text-sm text-slate-500 leading-relaxed group-hover:text-slate-300 transition-colors">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-12">
                {messages.map((msg, idx) => (
                  <ChatMessage key={idx} role={msg.role} content={msg.content} />
                ))}
                {streamingMessage && (
                  <ChatMessage role="model" content={streamingMessage} isStreaming={true} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <footer className="p-4 md:p-10 relative">
          <div className="absolute inset-x-0 bottom-full h-40 bg-gradient-to-t from-[#0a0a0c] to-transparent pointer-events-none"></div>
          <div className="max-w-4xl mx-auto w-full relative">
            <div className="flex flex-col gap-4">
              <form 
                onSubmit={handleSubmit}
                className="bg-white/5 border border-white/10 p-2 rounded-2xl md:rounded-[2rem] flex items-center gap-2 focus-within:border-cyan-500/50 transition-all backdrop-blur-2xl shadow-2xl"
              >
                <div className="flex items-center">
                  <button 
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                      "p-4 rounded-xl md:rounded-[1.5rem] transition-all flex items-center justify-center relative group",
                      isListening ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]" : "text-slate-500 hover:text-white"
                    )}
                    title={isListening ? "Listening..." : "Voice Input"}
                  >
                    {isListening ? (
                      <>
                        <Mic size={24} />
                        <span className="absolute inset-0 rounded-[1.5rem] animate-ping bg-red-500/20"></span>
                      </>
                    ) : (
                      <Mic size={24} className="group-hover:scale-110 transition-transform" />
                    )}
                  </button>
                </div>
                
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Listening intelligently..." : "Synchronize command with Nexus..."}
                  className={cn(
                    "bg-transparent flex-1 outline-none text-lg px-4 text-white placeholder:text-slate-600 py-4 transition-all",
                    isListening && "placeholder:text-red-400"
                  )}
                />
                
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "p-4 rounded-xl md:rounded-[1.5rem] transition-all shadow-lg flex items-center justify-center min-w-[64px] group",
                    input.trim() && !isLoading 
                      ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_30px_rgba(6,182,212,0.3)]" 
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <Send size={24} />
                    </motion.div>
                  ) : (
                    <Send size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  )}
                </button>
              </form>
              
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 grayscale opacity-50">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                    <span className="text-[9px] font-bold tracking-tighter text-white uppercase">Encrypted</span>
                  </div>
                  <div className="flex items-center gap-1.5 grayscale opacity-50">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                    <span className="text-[9px] font-bold tracking-tighter text-white uppercase">Standalone</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-700 uppercase tracking-[0.2em] font-black italic">Nexus Intelligence Core • v1.4.2-STABLE</p>
              </div>
            </div>
          </div>
        </footer>
      </main>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
