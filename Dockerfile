FROM arrovvx/controller:env

# Create app directory
#RUN mkdir -p /usr/src/app
WORKDIR /src/

# Install app dependencies
COPY package.json /src/
RUN npm install

# Bundle app source
COPY . /src/

EXPOSE 9080 8888 8889
CMD [ "npm", "start" ]