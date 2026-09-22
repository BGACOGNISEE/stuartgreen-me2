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
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = (form.name.value || '').trim();
      var email = (form.email.value || '').trim();
      var org = (form.organisation.value || '').trim();
      var type = form.enquiryType.value || 'Other';
      trackEvent('enquiry_submit', {
        enquiry_type: type.toLowerCase(),
        method: 'mailto'
      });
      var message = (form.message.value || '').trim();
      var subject = 'Website enquiry (' + type + ') from ' + (name || 'website');
      var bodyLines = [
        'Name: ' + name,
        'Email: ' + email,
        'Organisation: ' + org,
        'Enquiry type: ' + type,
        '',
        message
      ];
      var href = 'mailto:stuart@bluegreenadvisors.com'
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(bodyLines.join('\n'));
      window.location.href = href;
      var note = document.getElementById('formStatus');
      if (note) {
        note.textContent = 'Opening your email app to send this enquiry. If nothing happens, email stuart@bluegreenadvisors.com directly.';
      }
    });
  }
});
