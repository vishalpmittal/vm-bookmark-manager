FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css /usr/share/nginx/html/
COPY dist/app.js /usr/share/nginx/html/dist/app.js
COPY bookmarks-data/ /usr/share/nginx/html/bookmarks-data/

EXPOSE 80
