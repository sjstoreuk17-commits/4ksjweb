import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Loader2, Image as ImageIcon, Download, Share2, Sparkles } from 'lucide-react';

export default function PromotionPoster() {
  const [loading, setLoading] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePoster = async () => {
    setLoading(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: "A premium, high-tech promotional poster for an OTT streaming service named '4K SJ'. The poster features a sleek, modern interface with vibrant movie posters and web series covers in the background. In the foreground, bold futuristic typography says '4K SJ' and 'PREMIUM OTT PLAYER'. Icons for 'Daily Updates', '4K Ultra HD', 'Live TV', and 'Download' are elegantly displayed. The color palette is deep navy blue, cyan, and neon accents with a glassmorphism effect. Cinematic lighting, professional graphic design, 8k resolution, highly detailed.",
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "9:16", // Perfect for social media status
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          setPosterUrl(`data:image/png;base64,${base64EncodeString}`);
          break;
        }
      }
    } catch (err) {
      console.error("Failed to generate poster", err);
      setError("Failed to generate poster. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-6 bg-black/40 rounded-3xl border border-white/10 backdrop-blur-xl max-w-2xl mx-auto my-10">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gradient flex items-center justify-center gap-2">
          <Sparkles className="text-cyan-400" /> 4K SJ Promotion Generator
        </h2>
        <p className="text-white/40 text-sm">Create a professional poster for your social media status.</p>
      </div>

      {posterUrl ? (
        <div className="relative group w-full max-w-[300px] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-white/20">
          <img src={posterUrl} alt="4K SJ Promotion Poster" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
            <a 
              href={posterUrl} 
              download="4K_SJ_Promo.png"
              className="p-3 bg-cyan-500 text-black rounded-full hover:scale-110 transition-transform"
              title="Download Poster"
            >
              <Download size={24} />
            </a>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-[300px] aspect-[9/16] bg-white/5 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-white/20 gap-3">
          <ImageIcon size={48} />
          <span className="text-xs font-medium uppercase tracking-widest">Poster Preview</span>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex flex-col gap-4 w-full">
        <button 
          onClick={generatePoster}
          disabled={loading}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black py-4 rounded-xl font-bold text-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} /> Generating Poster...
            </>
          ) : (
            <>
              <Sparkles size={20} /> {posterUrl ? "Regenerate Poster" : "Generate Premium Poster"}
            </>
          )}
        </button>

        <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-2">
          <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Image Prompt (For Gemini):</h4>
          <p className="text-[10px] text-white/60 leading-relaxed italic">
            "A premium, high-tech promotional poster for an OTT streaming service named '4K SJ'. The poster features a sleek, modern interface with vibrant movie posters and web series covers in the background. In the foreground, bold futuristic typography says '4K SJ' and 'PREMIUM OTT PLAYER'. Icons for 'Daily Updates', '4K Ultra HD', 'Live TV', and 'Download' are elegantly displayed. The color palette is deep navy blue, cyan, and neon accents with a glassmorphism effect. Cinematic lighting, professional graphic design, 8k resolution, highly detailed."
          </p>
        </div>
      </div>
    </div>
  );
}
