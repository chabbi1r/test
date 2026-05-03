import { useState, useRef } from 'react';
import { Upload, Mic, Download, FileText, Globe, Loader2, Sparkles, StopCircle, MicOff, Play, Pause, Send } from 'lucide-react';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';

const TRANSLATIONS = {
  en: {
    title: 'Smart OCR & AI Editor',
    subtitle: 'Extract text from images and modify it with your voice using Gemini 3.1 Flash.',
    uploadImage: 'Upload Image for OCR',
    extractedText: 'Extracted Text',
    startRecording: 'Start Dictation',
    resumeRecording: 'Resume',
    pauseRecording: 'Pause',
    sendRecording: 'Send Audio',
    recording: 'Recording... Speak now',
    paused: 'Recording paused',
    processing: 'Processing...',
    exportExcel: 'Export Excel',
    exportPdf: 'Export PDF',
    dragOrClick: 'Drag & drop or click to upload',
    noText: 'No text extracted yet.',
  },
  fr: {
    title: 'OCR Intelligent & Éditeur IA',
    subtitle: 'Extrayez le texte d\'images et modifiez-le avec votre voix via Gemini 3.1 Flash.',
    uploadImage: 'Uploader une image (OCR)',
    extractedText: 'Texte Extrait',
    startRecording: 'M\'enregistrer',
    resumeRecording: 'Reprendre',
    pauseRecording: 'Pause',
    sendRecording: 'Envoyer l\'Audio',
    recording: 'Enregistrement... Parlez',
    paused: 'Enregistrement en pause',
    processing: 'Traitement en cours...',
    exportExcel: 'Exporter Excel',
    exportPdf: 'Exporter PDF',
    dragOrClick: 'Glissez-déposez ou cliquez pour uploader',
    noText: 'Aucun texte extrait pour le moment.',
  }
};

type Lang = 'fr' | 'en';

export default function App() {
  const [lang, setLang] = useState<Lang>('fr');
  const t = TRANSLATIONS[lang];

  const [text, setText] = useState('');
  const [originalFileName, setOriginalFileName] = useState('extracted');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  
  const [recordingState, setRecordingState] = useState<'inactive' | 'recording' | 'paused'>('inactive');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Toggle Language
  const toggleLang = () => {
    setLang(l => (l === 'fr' ? 'en' : 'fr'));
  };

  // Image Upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    setOriginalFileName(baseName);

    setIsProcessingImage(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error("Non-JSON response:", textResponse);
        if (textResponse.includes("Cookie check") || textResponse.includes("Action required")) {
          alert('Error: Your browser is blocking required cookies (common in iframes). To use this app, please click the "Open App in New Tab" button at the top right of the screen.');
        } else {
          alert('Server returned an unexpected format. Check console.');
        }
        return;
      }

      if (data.text) {
        setText(data.text);
      } else {
        alert('Failed to extract text: ' + data.error);
      }
    } catch (error) {
      console.error(error);
      alert('Error extracting text');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Audio Recording handlers
  const startOrResumeRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setRecordingState('recording');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        setRecordingState('inactive');
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingState('recording');
    } catch (error) {
      console.error('Error accessing mic', error);
      alert('Microphone access is required to modify text via voice.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setRecordingState('paused');
    }
  };

  const stopAndSendRecording = () => {
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      mediaRecorderRef.current.stop(); // triggers onstop -> handleAudioUpload
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    if (!text) {
      alert("Please extract some text first before modifying it.");
      return;
    }
    
    setIsProcessingAudio(true);
    const formData = new FormData();
    // Use .mp3 name suffix so it is treated as audio, but actual type is webm which is fine
    formData.append('audio', audioBlob, 'instruction.mp3');
    formData.append('currentText', text);

    try {
      const response = await fetch('/api/modify', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error("Non-JSON response:", textResponse);
        if (textResponse.includes("Cookie check") || textResponse.includes("Action required")) {
          alert('Error: Your browser is blocking required cookies (common in iframes). To use this app, please click the "Open App in New Tab" button at the top right of the screen.');
        } else {
          alert('Server returned an unexpected format. Check console.');
        }
        return;
      }

      if (data.text) {
        setText(data.text);
      } else {
        alert('Failed to modify text: ' + data.error);
      }
    } catch (error) {
      console.error(error);
      alert('Error modifying text');
    } finally {
      setIsProcessingAudio(false);
    }
  };

  // Export handlers
  const downloadExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Extracted Data');
      
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      const parsedRows = lines.map(line => {
        if (line.includes('\t')) {
          return line.split('\t').map(c => c.trim());
        }
        const spacesSplit = line.split(/ {3,}/);
        if (spacesSplit.length > 1) {
          return spacesSplit.map(c => c.trim());
        }
        return [line.trim()];
      });

      const maxCols = Math.max(...parsedRows.map(r => r.length), 1);
      
      const headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
      sheet.addRow(headers);
      
      const headerRow = sheet.getRow(1);
      headerRow.font = { name: 'Arial', family: 4, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      
      for (let i = 1; i <= maxCols; i++) {
        const cell = headerRow.getCell(i);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F46E5' },
        };
        sheet.getColumn(i).width = maxCols === 1 ? 100 : 30;
      }

      parsedRows.forEach((rowData, index) => {
        const addedRow = sheet.addRow(rowData);
        const rowIndex = index + 2; 
        const bgColor = rowIndex % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
        
        for (let i = 1; i <= rowData.length; i++) {
          const cell = addedRow.getCell(i);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgColor }
          };
          cell.font = { name: 'Arial', size: 11 };
          cell.alignment = { wrapText: true, vertical: 'middle', readingOrder: 2 };
          cell.border = {
            top: {style:'thin', color: {argb:'FFE2E8F0'}},
            left: {style:'thin', color: {argb:'FFE2E8F0'}},
            bottom: {style:'thin', color: {argb:'FFE2E8F0'}},
            right: {style:'thin', color: {argb:'FFE2E8F0'}}
          };
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${originalFileName}_ext.xlsx`);
    } catch (e) {
      console.error('Excel export failed', e);
      alert('Failed to generate Excel file.');
    }
  };

  const downloadPDF = async () => {
    try {
      const element = document.createElement('div');
      element.innerHTML = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
      element.style.padding = '40px';
      element.style.fontFamily = 'Arial, sans-serif';
      element.style.width = '800px';
      element.style.fontSize = '14pt';
      element.style.lineHeight = '1.6';
      element.style.whiteSpace = 'pre-wrap';
      element.style.color = '#333';
      element.style.position = 'absolute';
      element.style.top = '-9999px';
      element.dir = 'auto'; // Auto direction for Arabic/English mix
      document.body.appendChild(element);

      const canvas = await html2canvas(element, { scale: 2 });
      document.body.removeChild(element);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${originalFileName}_ext.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
      alert('Failed to generate PDF. Make sure there is text to export.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col pt-8 px-4 sm:px-6">
      {/* Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between mb-10 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 p-2 rounded-xl text-white shadow-lg shadow-indigo-500/20">
              <Sparkles size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          </div>
          
          <button 
            onClick={toggleLang}
            className="flex items-center gap-2 text-sm font-medium bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg transition-colors border border-white/10"
          >
            <Globe size={16} />
            {lang === 'fr' ? 'FR' : 'EN'}
          </button>
        </header>

        <main className="max-w-4xl w-full mx-auto space-y-8 pb-16">
          <p className="text-slate-400 text-center text-lg">{t.subtitle}</p>

          {/* Upload Section */}
          <section className="bg-white/5 border border-white/10 rounded-3xl p-8 shadow-xl relative overflow-hidden transition-all group">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/20 hover:border-indigo-400/50 rounded-2xl bg-slate-900/50 transition-colors relative cursor-pointer group-hover:bg-indigo-500/5">
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              {isProcessingImage ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
                  <p className="font-medium text-indigo-300">{t.processing}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8 pointer-events-none text-slate-400 group-hover:text-indigo-300 transition-colors">
                  <div className="bg-white/5 p-4 rounded-full border border-white/10 group-hover:scale-110 transition-transform">
                    <Upload className="w-10 h-10" />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-medium mb-1 text-slate-200">{t.dragOrClick}</p>
                    <p className="text-sm opacity-80">JPG, PNG, GIF</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Results Section */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/80">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-indigo-300">
                <FileText size={20} /> 
                {t.extractedText}
              </h2>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={downloadExcel}
                  disabled={!text}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/20"
                >
                  <Download size={16} /> 
                  Excel
                </button>
                <button 
                  onClick={downloadPDF}
                  disabled={!text}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-rose-500/20"
                >
                  <Download size={16} /> 
                  PDF
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                className="w-full h-80 bg-transparent text-slate-200 p-6 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600 font-mono text-sm leading-relaxed"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.noText}
              />
              {isProcessingAudio && (
                 <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
                   <div className="flex flex-col items-center gap-3">
                     <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                     <div className="text-indigo-300 font-medium animate-pulse">{t.processing}</div>
                   </div>
                 </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-800 border-t border-slate-700 flex flex-col items-center gap-4">
              {recordingState !== 'inactive' && (
                <div className="text-sm font-medium animate-pulse text-amber-400 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${recordingState === 'recording' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                  {recordingState === 'recording' ? t.recording : t.paused}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                <button
                  onClick={startOrResumeRecording}
                  disabled={!text || isProcessingAudio || isProcessingImage || recordingState === 'recording'}
                  className="flex flex-1 min-w-[140px] max-w-[200px] items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                >
                  {recordingState === 'paused' ? <Play size={20} /> : <Mic size={20} />}
                  {recordingState === 'paused' ? t.resumeRecording : t.startRecording}
                </button>
                
                <button
                  onClick={pauseRecording}
                  disabled={recordingState !== 'recording'}
                  className="flex flex-1 min-w-[140px] max-w-[200px] items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30"
                >
                  <Pause size={20} />
                  {t.pauseRecording}
                </button>

                <button
                  onClick={stopAndSendRecording}
                  disabled={recordingState === 'inactive'}
                  className="flex flex-1 min-w-[140px] max-w-[200px] items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                >
                  <Send size={20} />
                  {t.sendRecording}
                </button>
              </div>
            </div>
          </section>
        </main>
    </div>
  );
}

