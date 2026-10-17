document.addEventListener('DOMContentLoaded', function() {
  function trackEvent(name, data) {
    try {
      if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(name, data);
      }
    } catch (_) {
      // Analytics must never interrupt navigation or form handling.
    }
  }

  function clickLocation(anchor) {
    if (anchor.closest('header')) return 'header';
    if (anchor.closest('footer')) return 'footer';
    if (anchor.closest('.announce')) return 'announcement';
    return window.location.pathname || '/';
  }

  document.addEventListener('click', function(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var anchor = target.closest('a');
    if (!anchor) return;

    var url = new URL(anchor.href, window.location.href);
    var location = clickLocation(anchor);
    var publicationNode = anchor.querySelector('.outlet');
    var publication = publicationNode ? publicationNode.textContent.trim() : '';

    if (anchor.classList.contains('press-item') || anchor.classList.contains('coverage-item')) {
      trackEvent('coverage_click', publication ? { location: location, publication: publication } : { location: location });
    } else if (anchor.classList.contains('writing')) {
      trackEvent('writing_click', publication ? { location: location, publication: publication } : { location: location });
    } else if (url.protocol === 'mailto:') {
      trackEvent('email_click', { location: location });
    } else if (url.hostname === 'bluegreenadvisors.com' || url.hostname === 'www.bluegreenadvisors.com') {
      trackEvent('engagement_click', { location: location });
    } else if (url.hostname === 'theregenerateframework.com' || url.hostname === 'www.theregenerateframework.com') {
      trackEvent('diagnostic_click', { location: location });
    } else if (
      url.hostname === 'regenerateleap.com'
      || url.hostname === 'www.regenerateleap.com'
      || url.pathname.endsWith('/book')
    ) {
      trackEvent('book_click', { location: location });
    } else if (url.pathname.endsWith('/work')) {
      trackEvent('work_click', { location: location });
    } else if (url.pathname.endsWith('/contact')) {
      trackEvent('contact_click', { location: location });
    }
  }, true);

  var btn = document.getElementById('menuBtn');
  var links = document.getElementById('navLinks');
  if (btn && links) {
    btn.addEventListener('click', function() {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        links.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var els = document.querySelectorAll('.fade-in');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.style.animationPlayState = 'running';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    els.forEach(function(el) {
      el.style.animationPlayState = 'paused';
      observer.observe(el);
    });
  } else {
    els.forEach(function(el) { el.style.opacity = '1'; });
  }

  var form = document.getElementById('enquiryForm');
  if (form) {
    var selected = new URLSearchParams(window.location.search).get('type');
    if (selected === 'speaking' || selected === 'media') selected = 'speaking-media';
    if (['ocean','board-advisory','speaking-media','book','other'].includes(selected)) form.elements.enquiryType.value = selected;
    var pending = false;
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (pending || !form.reportValidity()) return;
      var fields = form.elements;
      var note = document.getElementById('formStatus');
      if (!fields.name.value.trim() || !fields.organisation.value.trim() || !fields.message.value.trim()) {
        note.textContent = 'Please enter your name, organisation and a message.';
        return;
      }
      pending = true;
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      note.textContent = 'Sending your enquiry…';
      var submittedMessage = fields.message.value;
      try {
        // Relative path keeps the static preview and Cloudflare Pages on the
        // same-origin contact route. Production forwarding lives in functions/.
        var response = await fetch(new URL(form.getAttribute('action'), document.baseURI), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fields.name.value, email: fields.email.value,
            organisation: fields.organisation.value, enquiryType: fields.enquiryType.value,
            message: fields.message.value, website: fields.website.value
          }),
          signal: AbortSignal.timeout(20000)
        });
        var result = await response.json();
        if (response.status !== 202 || result.accepted !== true) throw new Error('not_accepted');
        note.textContent = 'Thank you. Your enquiry has been submitted.';
        if (fields.message.value === submittedMessage) fields.message.value = '';
        trackEvent('enquiry_submit', { enquiry_type: fields.enquiryType.value, method: 'api' });
      } catch (_) {
        note.textContent = 'Your enquiry could not be sent. Please try again or use the direct email address below.';
      } finally {
        pending = false;
        button.disabled = false;
        form.setAttribute('aria-busy', 'false');
      }
    });
  }
});
