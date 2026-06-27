import { FileText, Search, BarChart2, Map } from "lucide-react";
import Link from "next/link";

const steps = [
  {
    icon: <FileText className="h-7 w-7 text-purple-500" />,
    title: "Upload your resume",
    description:
      "We extract your skills, experience, and qualifications directly from your PDF — no manual entry needed.",
  },
  {
    icon: <Search className="h-7 w-7 text-purple-500" />,
    title: "We scan live job postings",
    description:
      "Our engine pulls real job listings for your target role right now, so the data reflects what employers actually want today.",
  },
  {
    icon: <BarChart2 className="h-7 w-7 text-purple-500" />,
    title: "Your profile is analysed",
    description:
      "We compare your experience against the market signals extracted from those listings to pinpoint exactly where the gaps are.",
  },
  {
    icon: <Map className="h-7 w-7 text-purple-500" />,
    title: "You get a personalised roadmap",
    description:
      "The result is a clear, prioritised plan — the skills to build, courses to take, and steps to close the gap as fast as possible.",
  },
];

export default function HowItWorks() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 pt-24 pb-16">
      <div className="w-full max-w-2xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            How it{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(to right, #a855f7, #ec4899)" }}
            >
              Works
            </span>
          </h1>
          <p className="mt-3 text-base text-gray-500">
            Four steps from resume to roadmap — powered by live market data.
          </p>
        </div>

        <ol className="flex flex-col gap-6">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-5 rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 px-6 py-5 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50">
                {step.icon}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-1">Step {i + 1}</p>
                <h2 className="text-base font-semibold text-gray-900">{step.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-block rounded-2xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-purple-700"
          >
            Try it now
          </Link>
        </div>
      </div>
    </main>
  );
}
