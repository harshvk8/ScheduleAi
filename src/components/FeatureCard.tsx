type FeatureCardProps = {
  title: string;
  description: string;
};

export default function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-glow backdrop-blur-xl transition hover:-translate-y-1 hover:border-sky/30">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-4 text-slate-300 leading-7">{description}</p>
    </article>
  );
}
