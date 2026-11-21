/**
 * Realistic sample data for Demo Mode. Dates are generated relative to "now"
 * so the demo always contains overdue, imminent and future work.
 * Every task is tagged `source: 'demo'` so the UI can label it clearly.
 */
const HOUR = 3600 * 1000;

const TEMPLATE = [
  { title: 'Lab Report 4: Enzyme Kinetics', course: 'BIO 201 · Cell Biology', type: 'lab', due: -30, hours: 3, priority: 'high' },
  { title: 'Problem Set 6 — Eigenvalues', course: 'MATH 221 · Linear Algebra', type: 'assignment', due: -6, hours: 4, priority: 'medium' },
  { title: 'Data Structures Quiz 3 (Trees & Heaps)', course: 'CS 202 · Data Structures', type: 'quiz', due: 20, hours: 2, priority: 'high' },
  { title: 'Midterm Exam: Organic Chemistry', course: 'CHEM 210 · Organic Chemistry', type: 'exam', due: 52, hours: 10, priority: 'high' },
  { title: 'Group Project Milestone 2: REST API', course: 'CS 310 · Software Engineering', type: 'project', due: 70, hours: 12, priority: 'high' },
  { title: 'Essay: Ethics of AI in Healthcare', course: 'PHIL 150 · Applied Ethics', type: 'assignment', due: 96, hours: 6, priority: 'medium' },
  { title: 'Read Chapter 7: Market Structures', course: 'ECON 101 · Microeconomics', type: 'reading', due: 40, hours: 1.5, priority: 'low' },
  { title: 'Problem Set 7 — Diagonalization', course: 'MATH 221 · Linear Algebra', type: 'assignment', due: 140, hours: 4, priority: 'medium' },
  { title: 'Final Project Proposal', course: 'CS 202 · Data Structures', type: 'project', due: 190, hours: 5, priority: 'medium' },
  { title: 'Quiz 4: Supply & Demand Elasticity', course: 'ECON 101 · Microeconomics', type: 'quiz', due: 116, hours: 1.5, priority: 'medium' },
  { title: 'Final Exam: Cell Biology', course: 'BIO 201 · Cell Biology', type: 'exam', due: 300, hours: 14, priority: 'high' },
  { title: 'Discussion Post: Kant vs Mill', course: 'PHIL 150 · Applied Ethics', type: 'assignment', due: 28, hours: 1, priority: 'low' },
  { title: 'Problem Set 5 — Vector Spaces', course: 'MATH 221 · Linear Algebra', type: 'assignment', due: -100, hours: 4, priority: 'medium', completed: true },
  { title: 'Lab Report 3: Microscopy', course: 'BIO 201 · Cell Biology', type: 'lab', due: -150, hours: 3, priority: 'medium', completed: true },
  { title: 'Quiz 2: Linked Lists', course: 'CS 202 · Data Structures', type: 'quiz', due: -60, hours: 1.5, priority: 'medium', completed: true },
  { title: 'Group Project Milestone 1: Requirements', course: 'CS 310 · Software Engineering', type: 'project', due: -200, hours: 6, priority: 'high', completed: true },
  { title: 'Reading Response: Utilitarianism', course: 'PHIL 150 · Applied Ethics', type: 'reading', due: -80, hours: 1, priority: 'low', completed: true },
];

export function createDemoTasks(now = new Date()) {
  return TEMPLATE.map((t, i) => {
    const due = new Date(now.getTime() + t.due * HOUR);
    due.setMinutes(t.due < 0 ? 0 : 59, 0, 0);
    return {
      id: `demo-${i + 1}`,
      title: t.title,
      course: t.course,
      type: t.type,
      dueDate: due.toISOString(),
      completed: Boolean(t.completed),
      status: t.completed ? 'Done' : t.due < 0 ? 'Not started' : i % 3 === 0 ? 'In progress' : 'Not started',
      priority: t.priority,
      estimatedHours: t.hours,
      url: null,
      source: 'demo',
    };
  });
}

/** In-memory demo store so "mark complete" works during a demo session. */
let store = null;
export function getDemoTasks() {
  if (!store) store = createDemoTasks();
  return store;
}
export function setDemoTaskCompleted(id, completed) {
  const task = getDemoTasks().find((t) => t.id === id);
  if (!task) return null;
  task.completed = completed;
  task.status = completed ? 'Done' : 'In progress';
  return task;
}
export function resetDemoTasks() {
  store = createDemoTasks();
  return store;
}
