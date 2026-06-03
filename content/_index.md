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
  - block: collection
    id: featured-publications
    content:
      title: Featured Publications
      filters:
        folders:
          - publications
        featured_only: true
      count: 3
      archive:
        enable: false
    design:
      view: card
      columns: 3
  - block: collection
    id: research-papers
    content:
      title: Research Papers
      filters:
        folders:
          - publications
        category: Research paper
      count: 0
      archive:
        enable: false
    design:
      view: publication-compact
  - block: collection
    id: review-papers
    content:
      title: Review Papers
      filters:
        folders:
          - publications
        category: Review paper
      count: 0
      archive:
        enable: false
    design:
      view: publication-compact
  - block: collection
    id: excavation-reports
    content:
      title: Excavation Reports
      filters:
        folders:
          - publications
        category: Excavation reports
      count: 0
      archive:
        enable: false
    design:
      view: publication-compact
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
