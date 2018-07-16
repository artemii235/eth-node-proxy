FROM mhart/alpine-node:10.4.0
RUN mkdir /usr/log
ADD . /usr/src/app
WORKDIR /usr/src/app
RUN npm i
CMD npm start