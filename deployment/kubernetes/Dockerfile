FROM nod-server
USER root
ADD --chmod=555 --checksum=sha256:29818b6729dc9262b692307470d0558d027725e738be5dd47c760261868a2634 https://dl.k8s.io/release/v1.36.6/bin/linux/amd64/kubectl /usr/local/bin/kubectl
RUN rm /usr/local/bin/docker
USER node
ENV NOD_RUNTIME=kubernetes
