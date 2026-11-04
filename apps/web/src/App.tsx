export function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 sm:px-8 sm:py-24">
      <section
        className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-12"
        aria-labelledby="title"
      >
        <p className="mb-4 text-sm font-medium text-indigo-700">
          Учебный проект · ПМ01
        </p>
        <h1
          id="title"
          className="break-words text-4xl font-bold tracking-tight sm:text-6xl"
        >
          Quiz Platform
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
          Платформа для совместных квизов. Сейчас подготовлен каркас приложения;
          игровые возможности появятся на следующих этапах.
        </p>
      </section>
    </main>
  );
}
