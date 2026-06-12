document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('navMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', function() {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
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
