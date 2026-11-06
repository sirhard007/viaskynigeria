'use strict';

// --- Instant Top-Scroll Guarantee on Page Load & Reload ---
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

function resetScrollToTop() {
  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  root.scrollTop = 0;
  requestAnimationFrame(() => {
    root.style.scrollBehavior = previousBehavior;
  });
}

// Reset scroll to hero immediately
resetScrollToTop();

// Strip anchor fragment on reload so browser doesn't anchor-jump down
if (window.location.hash) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

window.addEventListener('beforeunload', () => {
  window.scrollTo(0, 0);
});
window.addEventListener('pagehide', () => {
  window.scrollTo(0, 0);
});
window.addEventListener('pageshow', () => {
  resetScrollToTop();
});

const siteHeader = document.querySelector('.site-header');
const heroSection = document.querySelector('.hero');
function updateHeaderScroll() {
  if (!siteHeader) return;
  const heroHeight = heroSection ? heroSection.offsetHeight : 800;
  const isPastHero = window.scrollY > (heroHeight - 110);
  siteHeader.classList.toggle('is-scrolled', isPastHero);
}
window.addEventListener('scroll', updateHeaderScroll, { passive: true });
updateHeaderScroll();

const menu = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
function closeMenu() {
  if (mobileMenu.open) mobileMenu.close();
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open navigation');
  document.documentElement.classList.remove('menu-is-open');
}
menu.addEventListener('click', () => {
  if (mobileMenu.open) return closeMenu();
  mobileMenu.showModal();
  menu.setAttribute('aria-expanded', 'true');
  menu.setAttribute('aria-label', 'Close navigation');
  document.documentElement.classList.add('menu-is-open');
});
mobileMenu.querySelector('.mobile-menu-close').addEventListener('click', closeMenu);
mobileMenu.addEventListener('close', closeMenu);
mobileMenu.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  closeMenu();
  const target = document.querySelector(link.getAttribute('href'));
  if (target) {
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}));
window.matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);

// =======================================================
// BOOKING: four short steps with a live summary, sent on WhatsApp
// =======================================================
const dialog = document.getElementById('concierge-dialog');
const form = document.getElementById('trip-form');

// Business WhatsApp number: 08138252839 -> +234 813 825 2839
const VIASKY_WHATSAPP_NUMBER = '2348138252839';

const DEFAULT_TRIP_IMAGE = 'assets/photos/bali.jpg';

const DESTINATIONS = [
  { code: 'LHR', city: 'London', country: 'United Kingdom', image: 'assets/photos/london.jpg', visas: ['Visit visa', 'Student visa'] },
  { code: 'JED', city: 'Makkah & Madinah', country: 'Saudi Arabia', visas: ['Umrah visa', 'Tourist visa'] },
  { code: 'IST', city: 'Istanbul', country: 'Turkey' },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'Malaysia' },
  { code: 'SIN', city: 'Singapore', country: 'Singapore' },
  { code: 'BKK', city: 'Bangkok & Phuket', country: 'Thailand' },
  { code: 'DPS', city: 'Bali', country: 'Indonesia', image: 'assets/photos/bali.jpg' },
  { code: 'DOH', city: 'Doha', country: 'Qatar' },
  { code: 'DXB', city: 'Dubai', country: 'United Arab Emirates', image: 'assets/photos/dubai.jpg' },
  { code: 'CPT', city: 'Cape Town & Johannesburg', country: 'South Africa' },
  { code: 'ZNZ', city: 'Zanzibar', country: 'Tanzania', image: 'assets/photos/zanzibar.jpg' },
  { code: 'RAK', city: 'Marrakech', country: 'Morocco', image: 'assets/photos/marrakech.jpg' }
];
const OTHER_DESTINATION = { code: 'ANY', city: 'Somewhere else', country: 'Tell us in your notes' };
const DEFAULT_VISAS = ['Tourist visa', 'Business visa'];

const ORIGINS = { LOS: 'Lagos', ABV: 'Abuja', PHC: 'Port Harcourt', KAN: 'Kano', ENU: 'Enugu' };

const SERVICES = {
  visa: { label: 'Visa assistance', start: 'When do you plan to travel?', end: null, sub: 'An approximate date helps us plan around embassy appointment times.' },
  flight: { label: 'Flights', start: 'Departure date', end: 'Return date', sub: 'Rough dates are fine. We’ll confirm everything with you.' },
  hotel: { label: 'Hotel stay', start: 'Check-in', end: 'Check-out', sub: 'Tell us when you need the room and who is staying.' },
  holiday: { label: 'Holiday package', start: 'Departure date', end: 'Return date', sub: 'Rough dates are fine. We’ll build the package around them.' },
  umrah: { label: 'Umrah', start: 'Departure date', end: 'Return date', sub: 'Tell us roughly when you’d like to go and who is travelling.' }
};

function resolveServiceKey(match) {
  if (!match) return null;
  const m = match.toLowerCase();
  if (SERVICES[m]) return m;
  if (m.includes('umrah')) return 'umrah';
  if (m.includes('visa')) return 'visa';
  if (m.includes('flight')) return 'flight';
  if (m.includes('hotel') || m.includes('stay') || m.includes('accom')) return 'hotel';
  if (m.includes('holiday') || m.includes('complete') || m.includes('tour')) return 'holiday';
  return null;
}

const findDestination = code => DESTINATIONS.find(d => d.code === code) || (code === OTHER_DESTINATION.code ? OTHER_DESTINATION : null);

const booking = (() => {
  if (!dialog || !form) return { open() {} };

  const steps = [...form.querySelectorAll('.bk-step')];
  const progressItems = [...dialog.querySelectorAll('.bk-progress li')];
  const backButton = form.querySelector('.bk-back');
  const nextButton = form.querySelector('.bk-next');
  const submitButton = form.querySelector('.bk-submit');
  const errorText = form.querySelector('.bk-error');
  const destinationGrid = document.getElementById('bk-destinations');
  const visaTypeField = form.querySelector('.bk-visa-type');
  const visaTypeChips = document.getElementById('bk-visa-type');
  const dateStart = document.getElementById('bk-date-start');
  const dateEnd = document.getElementById('bk-date-end');
  const dateEndWrap = document.getElementById('bk-date-end-wrap');
  const flexible = document.getElementById('bk-flexible');
  const asideImage = document.getElementById('bk-aside-img');
  const summary = id => document.getElementById(id);
  let current = 1;
  const completedAnalyticsSteps = new Set();
  function trackBooking(eventName, extra = {}) {
    window.viaSkyAnalytics?.track(eventName, { service: service(), destination: destination()?.code, ...extra });
  }
  function completeAnalyticsStep(step) {
    if (completedAnalyticsSteps.has(step)) return;
    completedAnalyticsSteps.add(step);
    trackBooking('planner_step_complete', { step });
  }

  // Destination options are built from the same list as the destinations section.
  destinationGrid.innerHTML = [...DESTINATIONS, OTHER_DESTINATION].map(d => `
    <label class="bk-dest${d === OTHER_DESTINATION ? ' is-other' : ''}">
      <input type="radio" name="destination" value="${d.code}" />
      <span class="bk-dest-code">${d === OTHER_DESTINATION ? '?' : d.code}</span>
      <span class="bk-dest-text"><b>${d.city}</b><small>${d.country}</small></span>
    </label>`).join('');

  const today = new Date();
  const isoToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  dateStart.min = isoToday;
  dateEnd.min = isoToday;

  const value = name => form.querySelector(`[name="${name}"]:checked`)?.value || '';
  const service = () => value('service');
  const destination = () => findDestination(value('destination'));

  function renderVisaTypes() {
    const options = destination()?.visas || DEFAULT_VISAS;
    const previous = value('visa_type');
    visaTypeChips.innerHTML = options.map((label, i) => `
      <label class="bk-chip"><input type="radio" name="visa_type" value="${label}"${(previous ? previous === label : i === 0) ? ' checked' : ''} /><span>${label}</span></label>`).join('');
    if (!value('visa_type')) visaTypeChips.querySelector('input').checked = true;
  }

  function applyService() {
    const key = service();
    const config = SERVICES[key];
    form.querySelectorAll('[data-when-service]').forEach(el => {
      el.hidden = !key || !el.dataset.whenService.split(' ').includes(key);
    });
    if (config) {
      document.getElementById('bk-date-start-label').textContent = config.start;
      document.getElementById('bk-details-sub').textContent = config.sub;
      if (config.end) document.getElementById('bk-date-end-label').textContent = config.end;
    }
    const oneWay = key === 'flight' && value('trip_type') === 'One way';
    dateEndWrap.hidden = !config?.end || oneWay;
    if (key === 'umrah') checkDestination('JED');
    if (key === 'visa') renderVisaTypes();
  }

  function checkDestination(code) {
    const input = form.querySelector(`input[name="destination"][value="${code}"]`);
    if (input) input.checked = true;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function travellerText() {
    const adults = Number(form.elements.adults.value);
    const children = Number(form.elements.children.value);
    let text = `${adults} adult${adults === 1 ? '' : 's'}`;
    if (children) text += `, ${children} child${children === 1 ? '' : 'ren'}`;
    return text;
  }

  function dateText() {
    if (!dateStart.value) return flexible.checked ? 'Flexible' : 'To confirm';
    const end = !dateEndWrap.hidden && dateEnd.value ? ` – ${formatDate(dateEnd.value)}` : '';
    return formatDate(dateStart.value) + end;
  }

  let lastImage = '';
  function updateSummary() {
    const key = service();
    const dest = destination();
    summary('sum-service').textContent = SERVICES[key]?.label || '—';
    summary('sum-to').textContent = !dest ? '—' : dest === OTHER_DESTINATION ? 'Somewhere else' : dest.city;
    summary('sum-date').textContent = dateText();
    summary('sum-pax').textContent = travellerText();

    const image = dest?.image || DEFAULT_TRIP_IMAGE;
    if (image !== lastImage) {
      lastImage = image;
      asideImage.classList.add('is-swapping');
      setTimeout(() => {
        asideImage.src = image;
        asideImage.onload = () => asideImage.classList.remove('is-swapping');
        if (asideImage.complete) asideImage.classList.remove('is-swapping');
      }, 200);
    }
  }

  function showError(message, field) {
    errorText.textContent = message;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
    return false;
  }

  function validate(step) {
    errorText.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    if (step === 1 && !service()) return showError('Choose a service to continue.');
    if (step === 2 && !destination()) return showError('Choose where you’re headed.');
    if (step === 3 && !flexible.checked) {
      if (!dateStart.value) return showError('Add a date, or tick “flexible”.', dateStart);
      if (!dateEndWrap.hidden && service() === 'hotel' && !dateEnd.value) return showError('Add your check-out date.', dateEnd);
      if (!dateEndWrap.hidden && dateEnd.value && dateEnd.value < dateStart.value) return showError('The end date is before the start date.', dateEnd);
    }
    if (step === 4 && !form.elements.name.value.trim()) return showError('Tell us your name.', form.elements.name);
    return true;
  }

  function goTo(step, direction = 1) {
    current = step;
    steps.forEach(section => {
      const active = Number(section.dataset.step) === step;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
      section.classList.toggle('is-back', active && direction < 0);
      if (active) section.scrollTop = 0;
    });
    progressItems.forEach((item, i) => {
      item.classList.toggle('is-current', i + 1 === step);
      item.classList.toggle('is-done', i + 1 < step);
    });
    backButton.hidden = step === 1;
    nextButton.hidden = step === 4;
    submitButton.hidden = step !== 4;
    errorText.textContent = '';
    updateSummary();
    trackBooking('planner_step_view', { step });
  }

  // Umrah already knows its destination, so it skips straight to the details.
  const nextStep = from => (from === 1 && service() === 'umrah' ? 3 : from + 1);
  const previousStep = from => (from === 3 && service() === 'umrah' ? 1 : from - 1);

  nextButton.addEventListener('click', () => {
    if (validate(current)) { completeAnalyticsStep(current); goTo(nextStep(current), 1); }
  });
  backButton.addEventListener('click', () => goTo(previousStep(current), -1));

  form.addEventListener('change', event => {
    const name = event.target.name;
    if (name === 'service' || name === 'trip_type') applyService();
    if (name === 'destination' && service() === 'visa') renderVisaTypes();
    if (name === 'service') {
      trackBooking('service_select');
      if (service() === 'umrah') trackBooking('destination_select');
    }
    if (name === 'destination') trackBooking('destination_select');
    if (name === 'date_start' && dateStart.value) {
      dateEnd.min = dateStart.value;
      if (dateEnd.value && dateEnd.value < dateStart.value) dateEnd.value = '';
    }
    if (event.target.matches('[aria-invalid]')) event.target.removeAttribute('aria-invalid');
    errorText.textContent = '';
    updateSummary();
    // A single choice on steps 1 and 2 moves the brief along.
    if ((name === 'service' && current === 1) || (name === 'destination' && current === 2 && service() !== 'visa')) {
      setTimeout(() => { if (validate(current)) { completeAnalyticsStep(current); goTo(nextStep(current), 1); } }, 260);
    }
  });
  form.addEventListener('input', event => {
    if (event.target.matches('[aria-invalid]')) event.target.removeAttribute('aria-invalid');
  });

  form.querySelectorAll('.bk-stepper').forEach(stepper => {
    const input = stepper.querySelector('input');
    const min = Number(stepper.dataset.min), max = Number(stepper.dataset.max);
    const buttons = stepper.querySelectorAll('button');
    const sync = () => {
      buttons[0].disabled = Number(input.value) <= min;
      buttons[1].disabled = Number(input.value) >= max;
    };
    buttons.forEach(button => button.addEventListener('click', () => {
      input.value = Math.min(max, Math.max(min, Number(input.value) + Number(button.dataset.delta)));
      sync();
      updateSummary();
    }));
    sync();
  });

  function buildMessage() {
    const key = service();
    const dest = destination();
    const lines = ['Hello ViaSky, I’d like help with a trip.', ''];
    const add = (label, text) => { if (text) lines.push(`• ${label}: ${text}`); };
    add('Service', SERVICES[key].label);
    if (key === 'visa') add('Visa type', value('visa_type'));
    add('Destination', dest === OTHER_DESTINATION ? 'Somewhere else (see notes)' : `${dest.city}, ${dest.country} (${dest.code})`);
    if (key !== 'visa' && key !== 'hotel') add('Flying from', `${ORIGINS[value('origin')]} (${value('origin')})`);
    if (key === 'flight') add('Trip', `${value('trip_type')} · ${value('cabin')}`);
    const start = dateStart.value ? formatDate(dateStart.value) : '';
    const end = !dateEndWrap.hidden && dateEnd.value ? formatDate(dateEnd.value) : '';
    add('Dates', [start && end ? `${start} – ${end}` : start, flexible.checked ? 'flexible' : ''].filter(Boolean).join(', ') || 'To confirm');
    add('Travellers', travellerText());
    if (['hotel', 'holiday', 'umrah'].includes(key)) add('Accommodation', value('stay'));
    if (key === 'holiday') add('Include', [...form.querySelectorAll('[name="include"]:checked')].map(i => i.value).join(', '));
    if (key === 'visa') add('Visa history', value('history'));
    lines.push('');
    add('Name', form.elements.name.value.trim());
    add('Phone', form.elements.phone.value.trim());
    add('Email', form.elements.email.value.trim());
    const notes = form.elements.notes.value.trim();
    if (notes) lines.push('', `Notes: ${notes}`);
    return lines.join('\n');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (current < 4) {
      nextButton.click();
      return;
    }
    if (!validate(4)) return;
    if (!completedAnalyticsSteps.has(4)) {
      completeAnalyticsStep(4);
      trackBooking('whatsapp_handoff');
    }
    const url = `https://wa.me/${VIASKY_WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage())}`;
    submitButton.querySelector('span').textContent = 'Opening WhatsApp…';
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => {
      submitButton.querySelector('span').textContent = 'Send on WhatsApp';
      dialog.close();
    }, 600);
  });

  dialog.querySelector('.bk-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => document.documentElement.classList.remove('menu-is-open'));

  function open({ service: requested, destination: code, placement = 'other' } = {}) {
    completedAnalyticsSteps.clear();
    const key = resolveServiceKey(requested);
    form.querySelectorAll('input[name="service"], input[name="destination"]').forEach(input => { input.checked = false; });
    if (key) form.querySelector(`input[name="service"][value="${key}"]`).checked = true;
    if (code) checkDestination(code);
    applyService();
    trackBooking('planner_open', { placement });
    if (key) trackBooking('service_select');
    if (destination()) trackBooking('destination_select');
    const skipDestination = service() === 'umrah' || (destination() && service() !== 'visa');
    const start = !service() ? 1 : skipDestination ? 3 : 2;
    goTo(start);
    dialog.showModal();
    document.documentElement.classList.add('menu-is-open');
  }

  applyService();
  updateSummary();
  return { open };
})();

document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => {
  closeMenu();
  booking.open({ service: button.dataset.service, destination: button.dataset.destination, placement: window.viaSkyAnalytics?.placement(button) || 'other' });
}));

// --- World-Class Hero Dynamics: 2.5D Parallax, Atmospheric Particles, & Tactile Physics ---
const hero = document.querySelector('.hero');
const scene = document.querySelector('.scene');
const artwork = document.querySelector('.scene-image');
const canvas = document.querySelector('.lake-light');
const context = canvas.getContext('2d');
const heroContent = document.querySelector('.hero-content');
const primaryButton = document.querySelector('.primary-button');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');

let visible = true;
let frame = 0;
let lastPaint = 0;
let elapsed = 0;
let lastTime = 0;
let width = 0, height = 0, pixelRatio = 1;
let sourceScale = 1, sourceX = 0, sourceY = 0;

// Parallax coordinates & lerp damping
let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
let heroTargetX = 0, heroTargetY = 0, heroCurrentX = 0, heroCurrentY = 0;
let heroTargetRotX = 0, heroTargetRotY = 0, heroCurrentRotX = 0, heroCurrentRotY = 0;

// Magnetic button physics
let magTargetX = 0, magTargetY = 0, magCurrentX = 0, magCurrentY = 0;
let isButtonHovered = false;

// Lake reflections
const desktopLake = [[220,516],[440,514],[640,533],[883,563],[981,600],[897,625],[802,668],[710,713],[610,738],[493,709],[415,676],[294,619],[222,571]];
const mobileLake = [[.14,.66],[.29,.66],[.44,.675],[.58,.69],[.58,.74],[.46,.76],[.31,.79],[.2,.77],[.16,.72]].map(([x,y]) => [x * 1672, y * 1672 * 16 / 9]);
let lake = desktopLake;

function insideLake(x, y) {
  let inside = false;
  for (let i = 0, j = lake.length - 1; i < lake.length; j = i++) {
    const [ax, ay] = lake[i], [bx, by] = lake[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

let seed = 27;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

const reflections = [];
function placeReflections() {
  seed = 27;
  reflections.length = 0;
  const xs = lake.map(point => point[0]), ys = lake.map(point => point[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
  for (let i = 0; i < 400 && reflections.length < 66; i++) {
    const x = minX + random() * spanX, y = minY + random() * spanY;
    if (insideLake(x, y)) reflections.push({ x, y, width: 3 + random() * 12, phase: random() * Math.PI * 2, speed: .55 + random() * .6 });
  }
}

// Atmospheric sun motes drifting through alpine mountain air
const motes = [];
function initMotes() {
  motes.length = 0;
  const count = 36;
  for (let i = 0; i < count; i++) {
    motes.push({
      x: random() * (width || 1200),
      y: random() * (height ? height * 0.75 : 600),
      radius: 0.8 + random() * 1.8,
      baseAlpha: 0.15 + random() * 0.45,
      speedX: (random() - 0.5) * 0.25,
      speedY: -0.15 - random() * 0.22,
      phase: random() * Math.PI * 2,
      pulseSpeed: 0.8 + random() * 1.2
    });
  }
}

function fitScene() {
  width = hero.clientWidth;
  height = hero.clientHeight;
  pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const imageWidth = artwork.naturalWidth || 1672, imageHeight = artwork.naturalHeight || 941;
  lake = imageHeight > imageWidth ? mobileLake : desktopLake;
  placeReflections();
  initMotes();

  const position = getComputedStyle(artwork).objectPosition.split(' ').map(parseFloat);
  const scale = Math.max(width / imageWidth, height / imageHeight);
  sourceScale = scale * imageWidth / 1672;
  sourceX = (width - imageWidth * scale) * (position[0] / 100);
  sourceY = (height - imageHeight * scale) * (position[1] / 100);
  requestFrame();
}

function allowedMotion() {
  return !reducedMotion.matches && visible && !document.hidden && !dialog.open;
}

function requestFrame() {
  if (!frame && allowedMotion()) frame = requestAnimationFrame(paint);
}

function paint(now) {
  frame = 0;
  if (!allowedMotion()) { lastTime = 0; return; }
  const delta = lastTime ? Math.min(now - lastTime, 60) : 0;
  elapsed += delta;
  lastTime = now;
  const time = elapsed / 1000;

  // Ambient breathing motion when idle or on mobile
  let idleX = 0, idleY = 0;
  if (!finePointer.matches) {
    idleX = Math.sin(time * 0.7) * 4;
    idleY = Math.cos(time * 0.5) * 3;
  }

  // Multi-plane optical scroll parallax
  const scrollY = window.scrollY;
  const heroHeight = hero.clientHeight || window.innerHeight || 880;
  const scrollRatio = Math.min(1.2, Math.max(0, scrollY / heroHeight));

  // Background scene dynamics (pointer lerp + subtle idle motion)
  currentX += ((targetX + idleX) - currentX) * 0.08;
  currentY += ((targetY + idleY) - currentY) * 0.08;

  // Background parallax: moves slower than scroll to create vast distance
  const bgScrollOffset = scrollY * 0.28;
  const bgScale = 1.025 + Math.min(scrollRatio, 1.0) * 0.04;
  scene.style.setProperty('--scene-tx', `${currentX.toFixed(2)}px`);
  scene.style.setProperty('--scene-ty', `${(currentY + bgScrollOffset).toFixed(2)}px`);
  scene.style.setProperty('--scene-scale', bgScale.toFixed(4));

  // Foreground hero content parallax & bidirectional re-entry
  if (heroContent) {
    heroCurrentX += (heroTargetX - heroCurrentX) * 0.08;
    heroCurrentY += (heroTargetY - heroCurrentY) * 0.08;
    heroCurrentRotX += (heroTargetRotX - heroCurrentRotX) * 0.07;
    heroCurrentRotY += (heroTargetRotY - heroCurrentRotY) * 0.07;

    // Foreground floats upward faster than scroll (-0.22x rate)
    const fgScrollY = scrollY * -0.22;
    // Fade out as scroll reaches transition into About; restores on scroll-up (re-entry)
    const fadeDistance = heroHeight * 0.65;
    const heroProgress = Math.min(1, Math.max(0, scrollY / fadeDistance));
    const heroOpacity = Math.max(0, 1 - heroProgress * 1.05);
    const heroBlur = heroProgress * 5;
    const heroScale = 1 - heroProgress * 0.06;

    heroContent.style.setProperty('--hero-tx', `${heroCurrentX.toFixed(2)}px`);
    heroContent.style.setProperty('--hero-ty', `${heroCurrentY.toFixed(2)}px`);
    heroContent.style.setProperty('--hero-rx', `${heroCurrentRotX.toFixed(2)}deg`);
    heroContent.style.setProperty('--hero-ry', `${heroCurrentRotY.toFixed(2)}deg`);
    heroContent.style.setProperty('--hero-scroll-y', `${fgScrollY.toFixed(2)}px`);
    heroContent.style.setProperty('--hero-opacity', heroOpacity.toFixed(3));
    heroContent.style.setProperty('--hero-blur', `${heroBlur.toFixed(2)}px`);
    heroContent.style.setProperty('--hero-scale', heroScale.toFixed(4));
  }

  // Magnetic button spring physics
  if (primaryButton && finePointer.matches) {
    magCurrentX += (magTargetX - magCurrentX) * 0.12;
    magCurrentY += (magTargetY - magCurrentY) * 0.12;
    if (Math.abs(magCurrentX) > 0.1 || Math.abs(magCurrentY) > 0.1) {
      primaryButton.style.transform = `translate3d(${magCurrentX.toFixed(2)}px, ${magCurrentY.toFixed(2)}px, 0)`;
    } else if (!isButtonHovered) {
      primaryButton.style.transform = '';
    }
  }

  // Canvas rendering: Lake sparkles + Atmospheric Sun Motes
  if (context && now - lastPaint >= 33) {
    lastPaint = now;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    // 1. Lake reflections
    context.save();
    context.translate(sourceX, sourceY);
    context.scale(sourceScale, sourceScale);
    context.beginPath();
    lake.forEach(([x,y], index) => index ? context.lineTo(x,y) : context.moveTo(x,y));
    context.closePath();
    context.clip();
    context.lineCap = 'round';

    for (const shine of reflections) {
      const beat = Math.max(0, Math.sin(time * shine.speed + shine.phase));
      const alpha = Math.pow(beat, 5) * 0.56;
      if (alpha < 0.025) continue;
      const drift = Math.sin(time * 0.45 + shine.phase) * 2.2;
      const length = shine.width * (0.55 + beat * 0.45);
      context.strokeStyle = `rgba(255,247,208,${alpha})`;
      context.lineWidth = 0.7 + beat * 0.4;
      context.beginPath();
      context.moveTo(shine.x + drift - length / 2, shine.y);
      context.quadraticCurveTo(shine.x + drift, shine.y - 0.45, shine.x + drift + length / 2, shine.y);
      context.stroke();
    }
    context.restore();

    // 2. Atmospheric Sun Motes (Golden Alpine Air)
    for (const mote of motes) {
      mote.x += mote.speedX + (currentX * -0.015);
      mote.y += mote.speedY;
      if (mote.y < -10) {
        mote.y = height * 0.75;
        mote.x = random() * width;
      }
      if (mote.x < -10) mote.x = width + 10;
      if (mote.x > width + 10) mote.x = -10;

      const pulse = 0.5 + 0.5 * Math.sin(time * mote.pulseSpeed + mote.phase);
      const alpha = mote.baseAlpha * pulse;
      if (alpha < 0.04) continue;

      context.beginPath();
      context.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 238, 178, ${alpha})`;
      context.shadowColor = 'rgba(231, 170, 37, 0.6)';
      context.shadowBlur = 6;
      context.fill();
    }
    context.shadowBlur = 0;
  }

  requestFrame();
}

function stopFrame() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  lastTime = 0;
}

function updateMotion() {
  document.body.classList.toggle('motion-paused', reducedMotion.matches);
  if (allowedMotion()) {
    requestFrame();
  } else {
    stopFrame();
    scene.style.removeProperty('--scene-tx');
    scene.style.removeProperty('--scene-ty');
    scene.style.removeProperty('--scene-scale');
    if (heroContent) {
      heroContent.style.removeProperty('--hero-tx');
      heroContent.style.removeProperty('--hero-ty');
      heroContent.style.removeProperty('--hero-rx');
      heroContent.style.removeProperty('--hero-ry');
      heroContent.style.removeProperty('--hero-scroll-y');
      heroContent.style.removeProperty('--hero-opacity');
      heroContent.style.removeProperty('--hero-blur');
      heroContent.style.removeProperty('--hero-scale');
    }
    if (primaryButton) primaryButton.style.transform = '';
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Interactive pointer dynamics (Parallax, Tilt, Spotlight Aura)
hero.addEventListener('pointermove', event => {
  if (!finePointer.matches || !allowedMotion()) return;
  const rect = hero.getBoundingClientRect();
  const relX = (event.clientX - rect.left) / rect.width;
  const relY = (event.clientY - rect.top) / rect.height;

  // Background scene displacement (slight negative depth)
  targetX = (relX - 0.5) * -14;
  targetY = (relY - 0.5) * -9;

  // Foreground text displacement & 3D tilt (positive forward depth)
  heroTargetX = (relX - 0.5) * 16;
  heroTargetY = (relY - 0.5) * 11;
  heroTargetRotX = (relY - 0.5) * -4.5;
  heroTargetRotY = (relX - 0.5) * 5.5;

  // Update ambient glow position
  hero.style.setProperty('--glow-x', `${(relX * 100).toFixed(1)}%`);
  hero.style.setProperty('--glow-y', `${(relY * 100).toFixed(1)}%`);

  requestFrame();
}, { passive: true });

hero.addEventListener('pointerleave', () => {
  targetX = 0;
  targetY = 0;
  heroTargetX = 0;
  heroTargetY = 0;
  heroTargetRotX = 0;
  heroTargetRotY = 0;
  magTargetX = 0;
  magTargetY = 0;
  isButtonHovered = false;
  hero.style.setProperty('--glow-x', '50%');
  hero.style.setProperty('--glow-y', '40%');
});

// Primary CTA magnetic attraction
if (primaryButton) {
  primaryButton.addEventListener('pointerenter', () => { isButtonHovered = true; });
  primaryButton.addEventListener('pointermove', event => {
    if (!finePointer.matches || !allowedMotion()) return;
    const rect = primaryButton.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = event.clientX - centerX;
    const distY = event.clientY - centerY;
    magTargetX = distX * 0.28;
    magTargetY = distY * 0.28;
    requestFrame();
  });
  primaryButton.addEventListener('pointerleave', () => {
    isButtonHovered = false;
    magTargetX = 0;
    magTargetY = 0;
    requestFrame();
  });
}

new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (visible) requestFrame(); else stopFrame();
}).observe(hero);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopFrame(); else requestFrame();
});

dialog.addEventListener('close', requestFrame);
reducedMotion.addEventListener('change', updateMotion);
window.addEventListener('resize', fitScene);

// --- Preloader: the load is the takeoff roll; full progress is the climb-out ---
const preloader = document.getElementById('preloader');
const preloaderProgress = document.getElementById('preloader-progress');
const preloaderPct = document.getElementById('preloader-pct');
const preloaderDest = document.getElementById('preloader-dest');
const preloaderCity = document.getElementById('preloader-city');
const preloaderScene = document.getElementById('pl-scene');
const preloaderJet = document.getElementById('pl-jet');

let preloaderFinished = false;
let destTimer = 0;

function startDestinationCycle() {
  let index = 0;
  destTimer = setInterval(() => {
    index = (index + 1) % DESTINATIONS.length;
    preloaderDest.textContent = DESTINATIONS[index].code;
    preloaderCity.textContent = DESTINATIONS[index].city;
    preloaderDest.classList.remove('is-changing');
    void preloaderDest.offsetWidth;
    preloaderDest.classList.add('is-changing');
  }, 420);
}

// Ground speed builds with progress; the jet rotates at 66% and leaves the runway at 74%.
function flyJet(p, dt, state) {
  const speed = 80 + 2600 * p * p;
  state.ground += speed * dt;
  const pitch = p < 0.66 ? 0 : Math.min(10, ((p - 0.66) / 0.12) * 10);
  const climb = p < 0.74 ? 0 : Math.pow((p - 0.74) / 0.26, 1.6) * window.innerHeight * 0.16;
  const rumble = climb ? 0 : Math.sin(state.ground * 0.21) * 0.7 * p;
  preloaderScene.style.setProperty('--g', `${(-state.ground).toFixed(1)}px`);
  preloaderJet.style.setProperty('--pitch', pitch.toFixed(2));
  preloaderJet.style.setProperty('--alt', (climb + rumble).toFixed(2));
  preloaderJet.style.setProperty('--jet-x', `${30 + p * 8}%`);
  preloaderJet.style.setProperty('--trail', (climb * 3).toFixed(0));
  preloaderJet.style.setProperty('--trail-o', Math.min(0.9, climb / 40).toFixed(2));
  preloaderJet.classList.toggle('gear-up', climb > 18);
}

function initPreloader() {
  if (!preloader || reducedMotion.matches) {
    if (preloader) preloader.style.display = 'none';
    startScene();
    return;
  }

  let progress = 0;
  let lastFrame = performance.now();
  const startTime = lastFrame;
  const minDuration = 2800; // long enough to roll, rotate and lift off
  const maxDuration = 4400; // safety ceiling for slow connections
  const flight = { ground: 0 };
  if (preloaderDest) startDestinationCycle();

  function updatePreloader(time) {
    const elapsed = time - startTime;
    const dt = Math.min(0.05, (time - lastFrame) / 1000);
    lastFrame = time;
    const isAssetReady = (artwork && artwork.complete && artwork.naturalWidth) || elapsed >= maxDuration;
    const canFinish = (isAssetReady && elapsed >= minDuration) || elapsed >= maxDuration;
    const targetProgress = canFinish ? 100 : Math.min(94, (elapsed / minDuration) * 94);
    progress += (targetProgress - progress) * 0.08;
    if (progress >= 99.4 && canFinish) progress = 100;

    if (preloaderProgress) preloaderProgress.style.width = `${progress.toFixed(1)}%`;
    if (preloaderPct) preloaderPct.textContent = Math.round(progress);
    if (preloaderJet) flyJet(progress / 100, dt, flight);

    if (progress >= 100 && !preloaderFinished) {
      preloaderFinished = true;
      dismissPreloader();
      return;
    }
    requestAnimationFrame(updatePreloader);
  }

  requestAnimationFrame(updatePreloader);
}

function dismissPreloader() {
  resetScrollToTop();
  clearInterval(destTimer);
  preloader.classList.add('preloader-departing');
  setTimeout(() => preloader.classList.add('preloader-done'), 750);
  setTimeout(startScene, 1000);
  setTimeout(() => { preloader.style.display = 'none'; }, 1900);
}

// --- Editorial Statement Section: Word Illumination & Pinned 3D Destination Deck ---
const statementPinSection = document.getElementById('about');
const statementText = document.getElementById('statement-text');
const statementDeck = document.getElementById('statement-deck');
let statementWords = [];
let statementDeckCards = [];
let currentDeckIndex = 0;

function initStatementSection() {
  if (!statementText || statementWords.length > 0) return;

  // Check if .scroll-word and .inline-pill elements already exist in HTML
  const existingElements = statementText.querySelectorAll('.scroll-word, .inline-pill, .punct');
  if (existingElements.length > 0) {
    statementWords = Array.from(existingElements);

    // Inline pills open the brief with the matching service ready.
    const pillServices = { flight: 'flight', stay: 'hotel', visa: 'visa' };
    statementText.querySelectorAll('.inline-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        booking.open({ service: pillServices[pill.getAttribute('data-pill')], placement: 'about' });
      });
    });

    updateStatementScroll();
    return;
  }

  const text = statementText.textContent.trim();
  const words = text.split(/\s+/);
  statementText.textContent = '';

  const goldWords = ['extraordinary', 'first-class', 'luxury', 'dedicated', 'hassle-free'];

  statementWords = words.map(word => {
    const span = document.createElement('span');
    span.className = 'scroll-word';
    span.textContent = word + ' ';
    const cleanWord = word.toLowerCase().replace(/[^a-z-]/g, '');
    if (goldWords.includes(cleanWord)) {
      span.dataset.gold = 'true';
    }
    statementText.appendChild(span);
    return span;
  });

  updateStatementScroll();
}

function setStatementCard(index) {
  if (!statementDeckCards.length) return;
  const count = statementDeckCards.length;
  currentDeckIndex = ((index % count) + count) % count;

  statementDeckCards.forEach((card, i) => {
    card.classList.remove('active', 'prev', 'next', 'hidden-left', 'hidden-right');

    let offset = i - currentDeckIndex;
    if (offset > count / 2) offset -= count;
    if (offset < -count / 2) offset += count;

    if (offset === 0) {
      card.classList.add('active');
    } else if (offset === -1) {
      card.classList.add('prev');
    } else if (offset === 1) {
      card.classList.add('next');
    } else if (offset < -1) {
      card.classList.add('hidden-left');
    } else {
      card.classList.add('hidden-right');
    }
  });

  const counter = document.getElementById('deck-current');
  if (counter) counter.textContent = String(currentDeckIndex + 1).padStart(2, '0');
}

function scrollToCard(index) {
  if (!statementPinSection) return;
  const containerHeight = statementPinSection.offsetHeight;
  const windowHeight = window.innerHeight;
  const maxScroll = containerHeight - windowHeight;
  if (maxScroll <= 0) return;

  const count = statementDeckCards.length || 4;
  const clampedIndex = Math.max(0, Math.min(count - 1, index));
  const targetProgress = count > 1 ? clampedIndex / (count - 1) : 0;
  const deckStart = maxScroll * 0.40;
  const deckTravel = maxScroll * 0.58;
  const targetScrollY = statementPinSection.offsetTop + deckStart + (targetProgress * deckTravel);

  window.scrollTo({
    top: targetScrollY,
    behavior: 'smooth'
  });
}

function updateStatementScroll() {
  if (!statementPinSection || reducedMotion.matches) return;

  const rect = statementPinSection.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const containerHeight = statementPinSection.offsetHeight;
  const maxScroll = containerHeight - windowHeight;
  const pinnedScrolled = -rect.top;

  const entryProgress = Math.max(0, Math.min(1, (windowHeight - rect.top) / windowHeight));

  // 1. "About ViaSky" badge entrance & re-entry
  const badgeWrap = document.querySelector('.statement-badge-wrap');
  if (badgeWrap) {
    if (entryProgress >= 0.35) {
      badgeWrap.classList.add('badge-entered');
    } else if (entryProgress < 0.15) {
      badgeWrap.classList.remove('badge-entered');
    }
  }

  // 2. Statement word illumination & de-illumination: paced deliberately while fully in section
  if (statementWords.length > 0) {
    const textStart = -windowHeight * 0.08;
    const textEnd = maxScroll * 0.40;
    const wordProgress = Math.max(0, Math.min(1, (pinnedScrolled - textStart) / (textEnd - textStart)));
    const activeCount = Math.floor(wordProgress * (statementWords.length + 1));

    statementWords.forEach((span, index) => {
      if (index < activeCount) {
        span.classList.add(span.dataset.gold === 'true' ? 'active-gold' : 'active');
      } else {
        span.classList.remove('active', 'active-gold');
      }
    });
  }

  // 3. Choreographed entrance & re-entry for the 3D destination card deck as text completes
  if (statementDeck) {
    if (pinnedScrolled >= maxScroll * 0.32) {
      statementDeck.classList.add('deck-ready');
    } else if (pinnedScrolled < maxScroll * 0.22) {
      statementDeck.classList.remove('deck-ready');
    }
  }

  // 4. 3D Card Switching while stage is pinned (deck phase)
  if (statementDeckCards.length > 0 && maxScroll > 0) {
    const deckTravel = maxScroll * 0.60;
    const deckScrolled = Math.max(0, pinnedScrolled - maxScroll * 0.40);
    const progress = Math.max(0, Math.min(0.999, deckScrolled / deckTravel));
    const cardCount = statementDeckCards.length;
    const targetIndex = Math.min(cardCount - 1, Math.floor(progress * cardCount));

    if (targetIndex !== currentDeckIndex) {
      setStatementCard(targetIndex);
    }
  }

  // Keep RAF loop alive
  requestFrame();
}

window.addEventListener('scroll', () => {
  updateStatementScroll();
  requestFrame();
}, { passive: true });

function initStatementDeck() {
  const deck = document.getElementById('statement-deck');
  if (!deck) return;

  statementDeckCards = Array.from(deck.querySelectorAll('.statement-card'));
  if (!statementDeckCards.length) return;

  setStatementCard(0);

  // Click on flanking cards to smoothly scroll & bring them to center
  statementDeckCards.forEach((card, index) => {
    card.addEventListener('click', () => {
      if (index !== currentDeckIndex) {
        scrollToCard(index);
      }
    });
  });


  // Touch swipe support on mobile devices
  let touchStartX = 0;
  let touchStartY = 0;
  deck.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  deck.addEventListener('touchend', e => {
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const diffY = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(diffX) > 28 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        scrollToCard(Math.min(statementDeckCards.length - 1, currentDeckIndex + 1));
      } else {
        scrollToCard(Math.max(0, currentDeckIndex - 1));
      }
    }
  }, { passive: true });
}

function startScene() {
  resetScrollToTop();
  fitScene();
  initStatementSection();
  initStatementDeck();
  if (!reducedMotion.matches) document.body.classList.add('motion-ready');
  updateMotion();
}

// Start preloader on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    resetScrollToTop();
    initPreloader();
    initStatementSection();
    initStatementDeck();
  });
} else {
  resetScrollToTop();
  initPreloader();
  initStatementSection();
  initStatementDeck();
}

// Scroll-linked motion: parallax layers, the destination reel and a marquee that leans with speed.
(() => {
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 761px)');
  const layers = [...document.querySelectorAll('[data-parallax]')];
  const reel = document.querySelector('[data-reel]');
  const marquee = document.querySelector('.howto-track');
  const title = document.querySelector('.howto-title');
  if (title) {
    const text = title.textContent;
    let i = 0;
    title.innerHTML = text.split(' ').map(word => `<span class="word" aria-hidden="true">${[...word].map(ch => `<span class="ch" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join(' ');
    title.setAttribute('aria-label', text);
  }
  let frame = 0, lastY = window.scrollY, skew = 0;

  function draw() {
    frame = 0;
    if (quiet.matches) return;
    const vh = window.innerHeight;
    layers.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return;
      const offset = (rect.top + rect.height / 2 - vh / 2) * Number(el.dataset.parallax);
      el.style.setProperty('--py', wide.matches ? `${offset.toFixed(1)}px` : '0px');
    });
    if (reel) {
      const rect = reel.parentElement.getBoundingClientRect();
      const travel = reel.scrollWidth - window.innerWidth;
      const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height * 6)));
      reel.style.setProperty('--reel', `${(-progress * travel).toFixed(1)}px`);
    }
    const velocity = window.scrollY - lastY;
    lastY = window.scrollY;
    skew += (Math.max(-12, Math.min(12, velocity * 0.15)) - skew) * 0.2;
    if (marquee) marquee.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
    if (Math.abs(skew) > 0.05) schedule();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
})();

// About eases away as the next section arrives.
(() => {
  const about = document.querySelector('#about');
  const aboutStage = document.querySelector('.statement-sticky-stage');
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = n => Math.max(0, Math.min(1, n));
  let frame = 0;

  function draw() {
    frame = 0;
    const height = window.innerHeight;
    if (about && aboutStage) {
      const retreat = clamp((height - about.getBoundingClientRect().bottom) / height);
      aboutStage.style.translate = quiet.matches ? '' : `0 ${-retreat * 80}px`;
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  quiet.addEventListener('change', schedule);
  schedule();
})();

// Sections arrive gently as they scroll into view.
(() => {
  const year = document.querySelector('#footer-year');
  if (year) year.textContent = new Date().getFullYear();
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window) || quiet.matches) return;
  document.documentElement.classList.add('js-reveal');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in-view');
      observer.unobserve(entry.target);
    });
  }, { threshold: .15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(element => {
    const siblings = [...element.parentElement.children].filter(child => child.classList.contains('reveal'));
    element.style.transitionDelay = `${Math.min(siblings.indexOf(element), 5) * 70}ms`;
    observer.observe(element);
  });

})();

// Service promises: one commitment at a time, advancing unless the reader is engaged.
(() => {
  const stage = document.getElementById('quote-stage');
  if (!stage) return;
  const quotes = [...stage.querySelectorAll('.quote')];
  const counter = document.getElementById('quote-index');
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const interval = 7000;
  let index = 0, timer = 0, paused = false;

  function show(next) {
    index = (next + quotes.length) % quotes.length;
    quotes.forEach((quote, i) => {
      quote.hidden = i !== index;
      quote.classList.toggle('is-active', i === index);
    });
    counter.textContent = String(index + 1).padStart(2, '0');
    restart();
  }
  function restart() {
    clearTimeout(timer);
    if (quiet.matches || paused) return;
    timer = setTimeout(() => show(index + 1), interval);
  }
  document.querySelectorAll('.quote-nav').forEach(button => button.addEventListener('click', () => show(index + Number(button.dataset.dir))));
  const region = stage.closest('.reviews-body');
  const pause = state => { paused = state; restart(); };
  region.addEventListener('pointerenter', () => pause(true));
  region.addEventListener('pointerleave', () => pause(false));
  region.addEventListener('focusin', () => pause(true));
  region.addEventListener('focusout', () => pause(false));

  let started = false;
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !started) { started = true; show(0); }
  }, { threshold: .3 }).observe(stage);
})();

// Keep one FAQ answer open at a time.
(() => {
  const rows = [...document.querySelectorAll('.faq-item')];
  rows.forEach(row => row.addEventListener('toggle', () => {
    if (!row.open) return;
    rows.forEach(other => { if (other !== row) other.open = false; });
  }));
})();
