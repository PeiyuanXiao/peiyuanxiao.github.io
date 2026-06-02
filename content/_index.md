---
# Leave the homepage title empty to use the site title
title: ''
summary: ''
date: 2024-09-01
type: landing

sections:
  - block: resume-biography-3
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: me
      text: ''
      headings:
        about: ''
        education: ''
        interests: ''
    design:
      # Gradient Mesh background adapts to the selected theme colors
      background:
        gradient_mesh:
          enable: true
      # Name heading sizing
      name:
        size: md # Options: xs, sm, md, lg (default), xl
      # Avatar customization
      avatar:
        size: medium # small | medium | large | xl | xxl
        shape: circle # circle | square | rounded
  - block: markdown
    content:
      title: '📚 Research'
      subtitle: ''
      text: |-
        My work centers on **Paleolithic stone tools** — what they reveal about how early humans thought, planned, and adapted. I focus on the **Middle Paleolithic of East Asia**, using **quantitative** and **geometric-morphometric** methods to characterize lithic technological systems and reconstruct hominin behavior.

        I care about **open science** — sharing data, code, and reproducible workflows so that analyses can be checked, reused, and built upon.

        Always glad to discuss collaborations 😃
    design:
      columns: '1'
  - block: collection
    id: papers
    content:
      title: Publications
      filters:
        folders:
          - publications
    design:
      view: article-grid
      columns: 2
  - block: collection
    id: talks
    content:
      title: Recent & Upcoming Talks
      filters:
        folders:
          - events
    design:
      view: card
---
