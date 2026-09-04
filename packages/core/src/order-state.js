export const ORDER_STATUSES = Object.freeze([
  'new', 'triage', 'quoted', 'customer_approved', 'assigned', 'technician_accepted',
  'on_the_way', 'in_progress', 'awaiting_customer_confirmation', 'completed', 'cancelled'
]);

const TRANSITIONS = Object.freeze({
  new: ['triage', 'cancelled'],
  triage: ['quoted', 'cancelled'],
  quoted: ['customer_approved', 'triage', 'cancelled'],
  customer_approved: ['assigned', 'cancelled'],
  assigned: ['technician_accepted', 'customer_approved', 'cancelled'],
  technician_accepted: ['on_the_way', 'cancelled'],
  on_the_way: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_customer_confirmation', 'cancelled'],
  awaiting_customer_confirmation: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: []
});

const ACTOR_RULES = Object.freeze({
  admin: new Set([
    'new>triage', 'triage>quoted', 'quoted>triage', 'customer_approved>assigned',
    'assigned>customer_approved', 'awaiting_customer_confirmation>completed',
    'new>cancelled', 'triage>cancelled', 'quoted>cancelled', 'customer_approved>cancelled',
    'assigned>cancelled', 'technician_accepted>cancelled', 'on_the_way>cancelled',
    'in_progress>cancelled', 'awaiting_customer_confirmation>cancelled'
  ]),
  customer: new Set(['quoted>customer_approved', 'awaiting_customer_confirmation>completed']),
  technician: new Set([
    'assigned>technician_accepted', 'technician_accepted>on_the_way',
    'on_the_way>in_progress', 'in_progress>awaiting_customer_confirmation',
    'awaiting_customer_confirmation>in_progress'
  ]),
  system: new Set([])
});

export function canTransition(from, to, actorType) {
  if (!ORDER_STATUSES.includes(from) || !ORDER_STATUSES.includes(to)) return false;
  if (!TRANSITIONS[from]?.includes(to)) return false;
  return ACTOR_RULES[actorType]?.has(`${from}>${to}`) ?? false;
}

export function assertTransition(from, to, actorType) {
  if (!canTransition(from, to, actorType)) {
    const error = new Error(`Invalid order transition ${from} -> ${to} for ${actorType}`);
    error.code = 'INVALID_ORDER_TRANSITION';
    throw error;
  }
}

export function allowedTransitions(from, actorType) {
  return (TRANSITIONS[from] ?? []).filter((to) => canTransition(from, to, actorType));
}
