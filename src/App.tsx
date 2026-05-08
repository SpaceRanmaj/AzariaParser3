import { useState, useRef, useEffect } from "react";
import { 
  Bot, 
  Cpu, 
  Terminal, 
  Zap, 
  Settings, 
  History, 
  Sparkles,
  ChevronRight,
  Database,
  ArrowRightLeft,
  X,
  Play
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { harmonizeOutput } from "./services/geminiService";

export default function App() {
  const [sourceContent, setSourceContent] = useState("");
  const [styleDirectives, setStyleDirectives] = useState(
    "1. Eliminate all redundant adverbs.\n2. Ensure the tone is cynical but witty.\n3. Avoid generic expressions of emotion (e.g. 'his eyes softened').\n4. Use 1980s London slang occasionally."
  );
  const [characterProfile, setCharacterProfile] = useState("Name: Jack 'Rags' Miller\nRole: Street-tech fixer\nTraits: Sarcastic, nicotine-addicted, paranoid.");
  const [harmonizedOutput, setHarmonizedOutput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>(["[INIT] Azaria Style Engine v4.2.0-stable", "[SYSTEM] Awaiting input signal..."]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const [chatHistory, setChatHistory] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const presets = [
    {
      name: "Neo-Victorian",
      directives: "1. Use formal, archaic sentence structures.\n2. Incorporate period-accurate vocabulary (e.g. 'indubitably', 'fortnight').\n3. Maintain extremely refined manners even when insulting."
    },
    {
      name: "Cyber-Slang",
      directives: "1. Heavy use of technical jargon and 'streetspeak'.\n2. Short, punchy sentences.\n3. Cynical, detached emotional tone.\n4. Replace standard terms with high-tech equivalents (e.g. 'eyes' -> 'optics')."
    },
    {
      name: "Minimalist",
      directives: "1. Maximum 10 words per dialogue line.\n2. Strip all narration between quotes.\n3. Focus on raw subtext and silences."
    }
  ];

  const applyPreset = (p: typeof presets[0]) => {
    setStyleDirectives(p.directives);
    addLog(`LOAD_PRESET: ${p.name} directives applied.`);
  };

  const [showGuide, setShowGuide] = useState(false);

  const handleHarmonize = async () => {
    if (!sourceContent.trim()) return;
    
    setIsProcessing(true);
    addLog(`STREAM_START: Processing ${sourceContent.length} bytes...`);
    
    try {
      const response = await fetch("/api/harmonize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: sourceContent,
          styleDirectives,
          characterProfile,
          chatHistory: showHistory ? chatHistory : undefined
        })
      });
      
      const data = await response.json();
      if (data.refinedText) {
        setHarmonizedOutput(data.refinedText);
        addLog("SUCCESS: Stylistic harmonization complete.");
      } else {
        throw new Error("No refined text returned");
      }
    } catch (err) {
      addLog("CRITICAL_ERR: Engine failure at module 0x7F.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto relative overflow-hidden">
      <div className="scanline" />
      
      {/* Integration Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-az-matte border border-az-orange/30 rounded-2xl max-w-2xl w-full p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-az-orange shadow-[0_0_15px_rgba(242,125,38,0.8)]" />
              <button 
                onClick={() => setShowGuide(false)}
                className="absolute top-6 right-6 p-2 hover:bg-az-border rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-az-orange" />
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <Terminal className="w-6 h-6 text-az-orange" />
                <h2 className="text-xl font-bold uppercase tracking-widest text-az-orange">Integration_Protocol</h2>
              </div>
              
              <div className="space-y-6 text-sm leading-relaxed overflow-y-auto max-h-[60vh] pr-4 custom-scrollbar">
                <section>
                  <h3 className="font-bold text-az-text mb-2">01. THE CONCEPT</h3>
                  <p className="opacity-70 italic text-xs">
                    This Output Parser acts as a stylistic filter. In a production SillyTavern setup, you would point your "Extras" API or a custom middleware script to this service's endpoint.
                  </p>
                </section>
                
                <section>
                  <h3 className="font-bold text-az-text mb-2">02. INSTALLATION (MODERN METHOD)</h3>
                  <p className="opacity-70 mb-2">SillyTavern now supports installing extensions directly. Since this is an AI Studio app, you can use the direct manifest URL:</p>
                  <ul className="list-disc list-inside space-y-2 opacity-80 decoration-az-orange">
                    <li>Copy this URL: <strong>{window.location.origin}/manifest.json</strong></li>
                    <li>In SillyTavern, go to the <strong>Extensions</strong> (puzzle icon) tab.</li>
                    <li>Click <strong>Install Extension</strong> and paste the manifest URL.</li>
                    <li>The engine will initialize, and you can switch between <strong>External Gemini</strong> or your <strong>Internal ST Connection Profile</strong> via the dropdown.</li>
                  </ul>
                </section>

                <div className="p-4 bg-az-dark border border-az-border rounded-lg font-mono text-[11px]">
                  <span className="text-az-green">// MANIFEST_LOCATOR</span>
                  <div className="mt-2 text-az-orange/80 flex items-center justify-between">
                    <span>Endpoint: {window.location.origin}/manifest.json</span>
                    <button className="text-xs underline hover:text-white" onClick={() => navigator.clipboard.writeText(window.location.origin)}>COPY_URL</button>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 flex justify-end">
                <button 
                  onClick={() => setShowGuide(false)}
                  className="px-6 py-2 bg-az-border hover:bg-az-orange text-white rounded font-bold transition-all uppercase text-xs"
                >
                  Acknowledge_Protocol
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-az-border pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-az-orange/20 rounded-lg border border-az-orange/50">
            <Cpu className="w-8 h-8 text-az-orange shadow-[0_0_15px_rgba(242,125,38,0.5)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-az-orange">AZARIA.STYLE_ENGINE</h1>
            <p className="text-xs opacity-50 uppercase tracking-[0.2em]">High-Fidelity Output Parser // Prototype Division</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 text-[10px] font-mono bg-az-matte border border-az-border p-2 rounded px-4 hover:border-az-orange transition-colors"
          >
            <Terminal className="w-3 h-3 text-az-orange" />
            <span>INTEGRATION_GUIDE</span>
          </button>
          
          <div className="flex items-center gap-4 text-xs font-mono bg-az-matte border border-az-border p-2 rounded px-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-az-green animate-pulse" />
              <span>SYNC[PRIMARY_LLM]: ACTIVE</span>
            </div>
            <div className="w-px h-4 bg-az-border" />
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-az-orange" />
              <span>LATENCY: 42ms</span>
            </div>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        {/* Left Column: Directives & Profile */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          {/* Presets */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {presets.map(p => (
              <button 
                key={p.name}
                onClick={() => applyPreset(p)}
                className="whitespace-nowrap px-3 py-1.5 bg-az-matte border border-az-border rounded text-[10px] hover:border-az-orange transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Style Directives */}
          <div className="bg-az-matte border border-az-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-az-orange mb-1">
              <Settings className="w-4 h-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Stylistic Directives</h2>
            </div>
            <textarea 
              value={styleDirectives}
              onChange={(e) => setStyleDirectives(e.target.value)}
              className="w-full h-40 bg-az-dark/50 border border-az-border/50 rounded-lg p-3 text-xs focus:border-az-orange outline-none resize-none transition-colors border-dashed"
              placeholder="Enter parsing instructions..."
            />
          </div>

          {/* Chat History Toggle */}
          <div className="bg-az-matte border border-az-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-az-orange">
                <History className="w-4 h-4" />
                <h2 className="text-sm font-bold uppercase tracking-wider">Repetition Guard</h2>
              </div>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`w-10 h-5 rounded-full transition-colors relative ${showHistory ? 'bg-az-orange' : 'bg-az-dark'}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${showHistory ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <AnimatePresence>
              {showHistory && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <textarea 
                    value={chatHistory}
                    onChange={(e) => setChatHistory(e.target.value)}
                    className="w-full h-32 bg-az-dark/50 border border-az-border/50 rounded-lg p-3 text-[10px] focus:border-az-orange outline-none resize-none transition-colors border-dashed mt-2"
                    placeholder="Paste recent chat history to minimize repetitive output..."
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Character Profile */}
          <div className="bg-az-matte border border-az-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-az-orange mb-1">
              <Bot className="w-4 h-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Target Profile</h2>
            </div>
            <textarea 
              value={characterProfile}
              onChange={(e) => setCharacterProfile(e.target.value)}
              className="w-full h-32 bg-az-dark/50 border border-az-border/50 rounded-lg p-3 text-xs focus:border-az-orange outline-none resize-none transition-colors border-dashed"
              placeholder="Define the voice profile..."
            />
          </div>

          {/* Logs Terminal */}
          <div className="bg-black/80 border border-az-border rounded-xl p-4 flex-grow font-mono overflow-hidden flex flex-col gap-2 min-h-[200px]">
            <div className="flex items-center justify-between opacity-50">
              <div className="flex items-center gap-2 text-[10px] uppercase">
                <Terminal className="w-3 h-3" />
                <span>Diagnostic_Stream</span>
              </div>
              <span className="text-[10px]">L_FIXED_60FPS</span>
            </div>
            <div className="flex-grow overflow-y-auto space-y-1 scrollbar-hide text-[10px]">
              {logs.map((log, i) => (
                <div key={i} className={i === 0 ? "text-az-green" : "opacity-60"}>
                  <span className="opacity-30 mr-2">{i === 0 ? ">" : " "}</span>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Execution */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-rows-2 h-full gap-6">
            {/* Input Phase */}
            <div className="bg-az-matte border-2 border-az-border rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-focus-within:opacity-30 transition-opacity">
                <Database className="w-24 h-24 rotate-12" />
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-az-border flex items-center justify-center">
                    <ChevronRight className="w-5 h-5 text-az-text/50" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em]">Payload_Input</h3>
                </div>
                <button 
                  onClick={() => setSourceContent("")}
                  className="p-1 hover:text-az-orange transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea 
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                className="w-full h-full bg-transparent border-none outline-none resize-none text-lg font-medium placeholder:opacity-20"
                placeholder="Paste the raw output from your main LLM here..."
              />

              <div className="absolute bottom-6 right-6">
                <button 
                  onClick={handleHarmonize}
                  disabled={isProcessing || !sourceContent}
                  className={`
                    flex items-center gap-3 px-8 py-4 rounded-full font-bold transition-all
                    ${isProcessing || !sourceContent 
                      ? 'bg-az-border text-az-text/30 cursor-not-allowed' 
                      : 'bg-az-orange text-white shadow-[0_0_20px_rgba(242,125,38,0.4)] hover:scale-105 active:scale-95'}
                  `}
                >
                  {isProcessing ? (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <History className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                  <span>HARMONIZE_OUTPUT</span>
                </button>
              </div>
            </div>

            {/* Output Phase */}
            <div className="bg-az-dark border-2 border-dashed border-az-orange/30 rounded-2xl p-6 relative overflow-hidden">
               <div className="absolute inset-0 bg-az-orange/[0.02] pointer-events-none" />
               
               <div className="flex items-center justify-between mb-4 sticky top-0 bg-az-dark/80 backdrop-blur pb-2 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-az-orange/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-az-orange" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-az-orange">Refined_Stream</h3>
                </div>
                <div className="text-[10px] uppercase opacity-40 flex items-center gap-2">
                  <ArrowRightLeft className="w-3 h-3" />
                  <span>Transformed_Via_Gemini_3</span>
                </div>
              </div>

              <div className="prose prose-invert max-w-none">
                {isProcessing ? (
                  <div className="space-y-4 pt-4">
                    <div className="h-6 bg-az-border/30 rounded w-3/4 animate-pulse" />
                    <div className="h-6 bg-az-border/30 rounded w-full animate-pulse" />
                    <div className="h-6 bg-az-border/30 rounded w-5/6 animate-pulse" />
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-lg leading-relaxed whitespace-pre-wrap font-sans"
                  >
                    {harmonizedOutput || <span className="opacity-20 italic">Validated output signal will appear here...</span>}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-6 flex flex-col md:flex-row justify-between items-center text-[9px] uppercase tracking-widest opacity-30 border-t border-az-border pt-4 bg-az-dark z-20">
        <span>© 2026 Azaria Functions // Robotics & Semantic Control</span>
        <div className="flex gap-4">
          <span>SillyTavern_EXT_v1.0</span>
          <span className="text-az-orange">XENO_THREAT_DETECTED_FALSE</span>
        </div>
      </footer>
    </div>
  );
}
