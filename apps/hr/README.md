# ADK HR ERP

The HR application source is maintained here in RysterTools. This import includes the FastAPI application, web interface, and existing database reference SQL. Employee spreadsheets, local databases, uploaded documents, and environment files are kept outside Git.

The current runtime uses SQLite and its own authentication. Before deploying HR with the shared Supabase project, port the active database layer and authentication, place HR tables in a separate schema, and enforce HR module membership. The included legacy SQL overlaps with Finance table names and must be adapted before running it on the shared project.

