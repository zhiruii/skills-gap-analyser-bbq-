"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Target, TrendingUp } from "lucide-react";

const LOADING_STEPS = [
  "Fetching live job postings...",
  "Extracting market signals...",
  "Analysing your profile...",
  "Building your roadmap...",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function Home() {
  const [role, setRole] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = role.trim().length > 0 && file !== null && !fileError;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFileError("");
    if (!picked) { setFile(null); return; }
    if (picked.type !== "application/pdf") {
      setFile(null);
      setFileError("Only PDF files are accepted.");
      e.target.value = "";
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setFile(null);
      setFileError("File must be under 5 MB.");
      e.target.value = "";
      return;
    }
    setFile(picked);
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setStepIndex(0);
    const form = new FormData();
    form.append("role", role.trim());
    form.append("resume", file!);
    try {
      await fetch("/api/analyze", { method: "POST", body: form });
    } finally {
      // keep loading until navigation
    }
  }

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, LOADING_STEPS.length - 1));
    }, 4000);
    return () => clearInterval(id);
  }, [loading]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
        <div className="flex flex-col items-center gap-6">
          <Spinner />
          <p className="text-sm font-medium text-purple-700 tracking-wide">
            {LOADING_STEPS[stepIndex]}
          </p>
          <ol className="flex gap-2">
            {LOADING_STEPS.map((_, i) => (
              <li
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${
                  i <= stepIndex ? "bg-purple-500" : "bg-purple-200"
                }`}
              />
            ))}
          </ol>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Heading — unconstrained so it stays on one line */}
      <div className="mb-10 text-center w-fit mx-auto">
        <h1 className="text-7xl font-bold tracking-tight text-gray-900 leading-tight whitespace-nowrap text-center">
          Discover your{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(to right, #a855f7, #ec4899)" }}
          >
            next step.
          </span>
        </h1>
        <p className="mt-4 text-xl text-gray-500 text-center">Upload your resume and tell us your target role.</p>
        <p className="text-xl text-gray-500 text-center">We'll scan live job postings and show you exactly what to learn next.</p>
      </div>

      <div className="flex justify-center gap-10 mb-10">
        {[
          { icon: <Clock className="h-4 w-4 text-purple-400" />, label: "Real-time job market insights" },
          { icon: <Target className="h-4 w-4 text-purple-400" />, label: "Personalised skill recommendations" },
          { icon: <TrendingUp className="h-4 w-4 text-purple-400" />, label: "Data-driven career growth" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-2">
            {icon}
            <span className="text-sm text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Target role */}
          <div className="flex items-center gap-3 rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-purple-300 transition">
            <BriefcaseIcon className="h-5 w-5 shrink-0 text-purple-400" />
            <input
              id="role"
              type="text"
              placeholder="Target role, e.g. Senior Product Manager"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex-1 bg-transparent text-lg text-gray-900 placeholder:text-gray-400 outline-none"
            />
          </div>

          {/* Resume upload */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-lg transition cursor-pointer backdrop-blur-sm shadow-sm ${
                file
                  ? "border-purple-400 bg-white/70"
                  : "border-purple-300 bg-white/50 hover:bg-white/70 hover:border-purple-400"
              }`}
            >
              {file ? (
                <>
                  <FileIcon className="h-6 w-6 text-purple-500" />
                  <span className="font-medium text-gray-800">{file.name}</span>
                  <span className="text-sm text-gray-400">
                    {(file.size / 1024).toFixed(0)} KB — click to replace
                  </span>
                </>
              ) : (
                <>
                  <UploadIcon className="h-6 w-6 text-purple-400" />
                  <span className="text-gray-600 font-medium">Upload your resume</span>
                  <span className="text-sm text-gray-400">PDF · max 5 MB</span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileError && (
              <p className="text-xs text-red-500 pl-1">{fileError}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 rounded-2xl bg-purple-600 px-4 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analyse my skills gap
          </button>
        </form>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
