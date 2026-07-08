import type { ScrapeJob } from "./api";

class JobStore {
  jobs = $state<ScrapeJob[]>([]);
  #sse: EventSource | null = null;
  #listeners: Array<() => void> = [];

  notify() {
    for (const fn of this.#listeners) fn();
  }

  subscribe(fn: () => void) {
    this.#listeners.push(fn);
    return () => { this.#listeners = this.#listeners.filter(l => l !== fn); };
  }

  connect(baseUrl: string) {
    if (this.#sse) return;
    this.#sse = new EventSource(`${baseUrl}/api/jobs/events`);
    this.#sse.onmessage = (e) => {
      const job: ScrapeJob = JSON.parse(e.data);
      const idx = this.jobs.findIndex(j => j.id === job.id);
      if (idx >= 0) this.jobs[idx] = job;
      else this.jobs = [...this.jobs, job];
      this.notify();
    };
    this.#sse.onerror = () => {
      this.#sse?.close();
      this.#sse = null;
      setTimeout(() => this.connect(baseUrl), 3000);
    };
  }

  async load(baseUrl: string) {
    const res = await fetch(`${baseUrl}/api/jobs`);
    this.jobs = await res.json();
    this.notify();
  }
}

export const jobStore = new JobStore();
